'use strict';

// PRIVATE PREPARATION. Requiring this module performs no request.
// Caller must run it BEFORE app installation/UI login, never alongside a live UI session.
const API = 'https://back-sport-ghxk.onrender.com';
const MAX_BODY_BYTES = 64 * 1024;
const TIMEOUT_MS = 15000;
const REPORT_KEYS = Object.freeze(['status', 'loginHttpStatus', 'logoutHttpStatus', 'sessionValid',
  'accessTokenReceived', 'logoutAttempted', 'logoutConfirmed', 'uiContinueAllowed', 'errorCode']);
const ERROR_CODES = Object.freeze(['NONE', 'CREDENTIALS_MISSING', 'CREDENTIALS_INVALID',
  'ACCOUNT_UNVERIFIED', 'CREDENTIALS_REJECTED', 'RATE_LIMITED', 'LOGIN_SERVER_ERROR',
  'LOGIN_NETWORK_ERROR', 'LOGIN_TIMEOUT', 'LOGIN_REDIRECT', 'LOGIN_HTTP_UNEXPECTED',
  'LOGIN_BODY_INVALID', 'LOGIN_BODY_TOO_LARGE', 'LOGIN_SESSION_INVALID',
  'LOGOUT_HTTP_FAILED', 'LOGOUT_NETWORK_ERROR', 'LOGOUT_TIMEOUT', 'LOGOUT_REDIRECT',
  'LOGOUT_BODY_TOO_LARGE', 'PROBE_INTERNAL_ERROR']);
const BLOCKED = new Set(['CREDENTIALS_MISSING', 'CREDENTIALS_INVALID',
  'ACCOUNT_UNVERIFIED', 'CREDENTIALS_REJECTED', 'RATE_LIMITED']);
const HTTP = value => value === null || Number.isInteger(value) && value >= 100 && value <= 599;
const successfulHttp = value => Number.isInteger(value) && value >= 200 && value <= 299;
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// Matches src/api/authApi.ts readSession, without returning or copying credentials.
function sessionMatches(value) {
  if (!isRecord(value) ||
    typeof value.accessToken !== 'string' || !value.accessToken.trim() || /\s/.test(value.accessToken) ||
    typeof value.refreshToken !== 'string' || !value.refreshToken.trim() || /\s/.test(value.refreshToken) ||
    typeof value.sessionId !== 'string' || !value.sessionId.trim() ||
    typeof value.accessTokenExpiresIn !== 'string') return false;
  const duration = /^(\d+)(s|m|h)$/.exec(value.accessTokenExpiresIn);
  if (!duration) return false;
  const ttl = Number(duration[1]) * { s: 1000, m: 60000, h: 3600000 }[duration[2]];
  return Number.isSafeInteger(ttl) && ttl > 0 && ttl <= 86400000;
}

function validateProbeReport(value) {
  try {
    if (!isRecord(value) || Object.keys(value).length !== REPORT_KEYS.length ||
      !Object.keys(value).every(key => REPORT_KEYS.includes(key)) ||
      !['passed', 'blocked', 'failed'].includes(value.status) ||
      !HTTP(value.loginHttpStatus) || !HTTP(value.logoutHttpStatus) ||
      !ERROR_CODES.includes(value.errorCode) ||
      !REPORT_KEYS.slice(3, 8).every(key => typeof value[key] === 'boolean')) return false;
    const confirmed = successfulHttp(value.logoutHttpStatus);
    if (value.accessTokenReceived !== value.logoutAttempted ||
      value.logoutConfirmed && (!value.logoutAttempted || !confirmed) ||
      !value.logoutAttempted && value.logoutHttpStatus !== null ||
      value.sessionValid && !value.accessTokenReceived) return false;
    const passed = value.errorCode === 'NONE' && successfulHttp(value.loginHttpStatus) &&
      value.sessionValid && value.accessTokenReceived && value.logoutAttempted && value.logoutConfirmed;
    return (value.errorCode === 'NONE') === passed && (value.status === 'passed') === passed && value.uiContinueAllowed === passed &&
      (value.status === 'blocked') === BLOCKED.has(value.errorCode);
  } catch { return false; }
}

class BodyError extends Error {
  constructor(code) { super(code); this.code = code; }
}
async function readBody(response) {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  let length = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks, length);
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) throw new BodyError('TOO_LARGE');
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    try { await reader.cancel(); } catch { /* Never expose stream errors. */ }
    throw error;
  } finally { reader.releaseLock(); }
}
function timedOut(error, signal) {
  return signal.aborted || error?.name === 'TimeoutError' || error?.name === 'AbortError';
}
function httpStatus(response) {
  if (!response || !HTTP(response.status) || response.status === null) throw new Error();
  return response.status;
}
function requestOptions(body, signal, accessToken) {
  return { method: 'POST', redirect: 'error', signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json',
      ...(accessToken === undefined ? {} : { Authorization: 'Bearer ' + accessToken }) },
    body: JSON.stringify(body) };
}

async function probeAccountAuth(options = {}) {
  const report = { status: 'failed', loginHttpStatus: null, logoutHttpStatus: null,
    sessionValid: false, accessTokenReceived: false, logoutAttempted: false,
    logoutConfirmed: false, uiContinueAllowed: false, errorCode: 'PROBE_INTERNAL_ERROR' };
  let accessToken;
  try {
    const { email, password, fetchImpl = globalThis.fetch } = options;
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      report.errorCode = 'CREDENTIALS_MISSING';
    } else if (email.trim().length > 100 ||
      !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email.trim()) ||
      password.length < 8 || password.length > 4096 || !password.isWellFormed() ||
      /[\u0000-\u001f\u007f]/.test(email + password) || typeof fetchImpl !== 'function') {
      report.errorCode = 'CREDENTIALS_INVALID';
    } else {
      const signal = AbortSignal.timeout(TIMEOUT_MS);
      try {
        const response = await fetchImpl(API + '/users/login-user',
          requestOptions({ email: email.trim().toLowerCase(), passw: password }, signal));
        report.loginHttpStatus = httpStatus(response);
        let data, bodyError;
        try { data = JSON.parse((await readBody(response)).toString('utf8')); }
        catch (error) { bodyError = error; }
        if (isRecord(data) && typeof data.accessToken === 'string' && data.accessToken.length > 0) {
          accessToken = data.accessToken;
          report.accessTokenReceived = true;
        }
        report.sessionValid = sessionMatches(data);
        const status = report.loginHttpStatus;
        if (status === 400 && isRecord(data) && data.code === 2) report.errorCode = 'ACCOUNT_UNVERIFIED';
        else if (status === 400 || status === 401) report.errorCode = 'CREDENTIALS_REJECTED';
        else if (status === 429) report.errorCode = 'RATE_LIMITED';
        else if (status >= 500) report.errorCode = 'LOGIN_SERVER_ERROR';
        else if (status >= 300 && status <= 399) report.errorCode = 'LOGIN_REDIRECT';
        // The deployed Nest controller returns 201; Axios/readSession accepts any valid 2xx session.
        else if (!successfulHttp(status)) report.errorCode = 'LOGIN_HTTP_UNEXPECTED';
        else if (bodyError?.code === 'TOO_LARGE') report.errorCode = 'LOGIN_BODY_TOO_LARGE';
        else if (bodyError && timedOut(bodyError, signal)) report.errorCode = 'LOGIN_TIMEOUT';
        else if (bodyError) report.errorCode = 'LOGIN_BODY_INVALID';
        else if (!report.sessionValid) report.errorCode = 'LOGIN_SESSION_INVALID';
        else report.errorCode = 'NONE';
      } catch (error) {
        report.errorCode = timedOut(error, signal) ? 'LOGIN_TIMEOUT' : 'LOGIN_NETWORK_ERROR';
      } finally {
        // Even an invalid/rejected response can contain an issued token: revoke it.
        // Unsafe header values are rejected by fetch and remain unconfirmed, never sanitized/reused.
        if (accessToken !== undefined) {
          report.logoutAttempted = true;
          const logoutSignal = AbortSignal.timeout(TIMEOUT_MS);
          try {
            const response = await fetchImpl(API + '/users/logout', requestOptions({}, logoutSignal, accessToken));
            report.logoutHttpStatus = httpStatus(response);
            await readBody(response); // Bounded consumption; authApi.logout does not require JSON content.
            if (successfulHttp(report.logoutHttpStatus)) report.logoutConfirmed = true;
            else report.errorCode = report.logoutHttpStatus >= 300 && report.logoutHttpStatus <= 399
              ? 'LOGOUT_REDIRECT' : 'LOGOUT_HTTP_FAILED';
          } catch (error) {
            report.errorCode = error?.code === 'TOO_LARGE' ? 'LOGOUT_BODY_TOO_LARGE'
              : timedOut(error, logoutSignal) ? 'LOGOUT_TIMEOUT' : 'LOGOUT_NETWORK_ERROR';
          }
          accessToken = undefined;
        }
      }
    }
  } catch {
    report.errorCode = 'PROBE_INTERNAL_ERROR';
  } finally {
    accessToken = undefined; // No token, body or credential is included in the returned report.
  }
  const passed = report.errorCode === 'NONE' && successfulHttp(report.loginHttpStatus) &&
    report.sessionValid && report.logoutConfirmed;
  report.status = passed ? 'passed' : BLOCKED.has(report.errorCode) ? 'blocked' : 'failed';
  report.uiContinueAllowed = passed;
  return report;
}

module.exports = { probeAccountAuth, validateProbeReport, REPORT_KEYS, ERROR_CODES, MAX_BODY_BYTES, TIMEOUT_MS };
