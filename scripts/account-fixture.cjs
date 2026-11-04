'use strict';
// Private in-process baseline and bounded reconciliation. Requiring this file performs no request.
const { isDeepStrictEqual } = require('node:util');
const { probeAccountAuth, validateProbeReport, MAX_BODY_BYTES, TIMEOUT_MS } = require('./account-auth-probe.cjs');
const API = 'https://back-sport-ghxk.onrender.com';
const TEST_NAME = 'Prueba SC';
const PROFILE_KEYS = Object.freeze(['nombre', 'aPaterno', 'aMaterno', 'email', 'telefono']);
const STATE_KEYS = Object.freeze(['profileNameAttempted', 'cartIncrementAttempted', 'cartRemoveAttempted', 'cartRemoveConfirmed', 'cartAddAttempted']);
const RESTORATION_KEYS = Object.freeze(['profileRestored', 'cartRestored', 'otherProfileFieldsUnchanged',
  'otherCartLinesUnchanged', 'baselineRestored', 'mutationUncertain', 'concurrentChangeObserved']);
const ERROR_CODES = Object.freeze(['NONE', 'FIXTURE_AUTH_FAILED', 'FIXTURE_AUTH_CLEANUP_FAILED',
  'FIXTURE_PROFILE_INVALID', 'FIXTURE_PROFILE_NOT_NORMALIZED', 'FIXTURE_CART_INVALID', 'FIXTURE_EMPTY',
  'FIXTURE_STOCK', 'FIXTURE_VARIANT_INVALID', 'FIXTURE_PRICE_CHANGED', 'FIXTURE_TARGET_AMBIGUOUS',
  'FIXTURE_RESPONSE_TOO_LARGE', 'FIXTURE_RESPONSE_INVALID', 'FIXTURE_HTTP_FAILED', 'FIXTURE_NETWORK_ERROR',
  'FIXTURE_TIMEOUT', 'FIXTURE_UI_NOT_STOPPED', 'FIXTURE_INVALID', 'FIXTURE_STATE_INVALID',
  'FIXTURE_CONFLICT', 'FIXTURE_MUTATION_UNCERTAIN', 'FIXTURE_RESTORE_FAILED', 'FIXTURE_UNEXPECTED']);
const baselines = new WeakSet();
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
class FixtureError extends Error { constructor(code) { super(code); this.code = code; } }
function need(value, code) { if (!value) throw new FixtureError(code); }
function safeFixtureCode(error) { try { return ERROR_CODES.includes(error?.code) ? error.code : 'FIXTURE_UNEXPECTED'; } catch { return 'FIXTURE_UNEXPECTED'; } }
function numeric(value, integer = false, minimum = 0) {
  need(typeof value === 'number' || typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value), 'FIXTURE_RESPONSE_INVALID');
  const n = Number(value);
  need(Number.isFinite(n) && n >= minimum && n <= Number.MAX_SAFE_INTEGER && (!integer || Number.isSafeInteger(n)), 'FIXTURE_RESPONSE_INVALID');
  return n;
}
function boundedText(value, max) { need(typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value), 'FIXTURE_RESPONSE_INVALID'); return value; }
function attributes(value) {
  need(record(value) && Object.keys(value).length <= 32, 'FIXTURE_RESPONSE_INVALID');
  const result = Object.create(null);
  for (const [key, item] of Object.entries(value)) {
    need(key.length > 0 && key.length <= 80 && !['__proto__', 'constructor', 'prototype'].includes(key), 'FIXTURE_RESPONSE_INVALID');
    result[key] = boundedText(item, 200);
  }
  return result;
}
function parseProfile(value, normalized = false) {
  need(record(value), 'FIXTURE_PROFILE_INVALID');
  const result = {};
  for (const key of PROFILE_KEYS) {
    need(typeof value[key] === 'string' && value[key].length <= 100 && !/[\u0000-\u001f\u007f]/.test(value[key]), 'FIXTURE_PROFILE_INVALID');
    result[key] = value[key];
  }
  if (normalized) {
    need(result.nombre.trim().length > 0 && result.nombre.length <= 30 && result.aPaterno.trim().length > 0 && result.aPaterno.length <= 40 &&
      result.aMaterno.trim().length > 0 && result.aMaterno.length <= 40 &&
      /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(result.email) && /^\d{10}$/.test(result.telefono), 'FIXTURE_PROFILE_INVALID');
    need(PROFILE_KEYS.every(key => result[key] === result[key].trim()) && result.email === result.email.toLowerCase(), 'FIXTURE_PROFILE_NOT_NORMALIZED');
    need(result.nombre !== TEST_NAME, 'FIXTURE_PROFILE_INVALID');
  }
  return result;
}
function parseCart(value) {
  need(record(value) && Array.isArray(value.items) && value.items.length <= 100 && record(value.summary), 'FIXTURE_CART_INVALID');
  const items = value.items.map(item => {
    need(record(item) && typeof item.activo === 'boolean', 'FIXTURE_CART_INVALID');
    const quantity = numeric(item.cantidad, true, 1); need(quantity <= 99, 'FIXTURE_CART_INVALID');
    return { variantId: numeric(item.id_variante, true, 1), productId: numeric(item.id_producto, true, 1),
      name: boundedText(item.nombre, 300), sku: boundedText(item.sku, 100), quantity,
      unitPrice: numeric(item.precio_unitario), stock: numeric(item.stock, true), active: item.activo,
      attributes: attributes(item.atributos ?? {}) };
  });
  need(new Set(items.map(item => item.variantId)).size === items.length, 'FIXTURE_CART_INVALID');
  const subtotal = numeric(value.summary.subtotal), itemCount = numeric(value.summary.itemCount, true);
  need(itemCount === items.reduce((sum, item) => sum + item.quantity, 0), 'FIXTURE_CART_INVALID');
  // Integer cents avoid accepting a malformed summary while tolerating ordinary decimal summation.
  need(Math.abs(subtotal - items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)) < 0.011, 'FIXTURE_CART_INVALID');
  return { id: numeric(value.id_carrito, true, 1), items, subtotal, itemCount };
}
function parseVariant(value, target) {
  need(Array.isArray(value) && value.length === 1 && record(value[0]) && numeric(value[0].id_producto, true, 1) === target.productId &&
    Array.isArray(value[0].variantes) && value[0].variantes.length <= 200, 'FIXTURE_VARIANT_INVALID');
  const variants = value[0].variantes.map(item => {
    need(record(item), 'FIXTURE_VARIANT_INVALID');
    const attrs = attributes(item.atributos ?? {}), sku = boundedText(item.sku, 100);
    return { id: numeric(item.id_variante, true, 1), stock: numeric(item.stock, true), currentPrice: numeric(item.precio),
      sku, attributes: attrs, selectorLabel: Object.entries(attrs).map(([key, item]) => key + ': ' + item).join(' · ') || sku };
  });
  need(new Set(variants.map(item => item.id)).size === variants.length, 'FIXTURE_VARIANT_INVALID');
  const found = variants.filter(item => item.id === target.variantId);
  need(found.length === 1, 'FIXTURE_VARIANT_INVALID');
  const variant = found[0];
  need(variant.selectorLabel.length > 0 && variants.filter(item => item.selectorLabel === variant.selectorLabel).length === 1, 'FIXTURE_TARGET_AMBIGUOUS');
  need(variant.sku === target.sku && isDeepStrictEqual(variant.attributes, target.attributes), 'FIXTURE_VARIANT_INVALID');
  return variant;
}
async function readBody(response) {
  need(response?.body && typeof response.body.getReader === 'function', 'FIXTURE_RESPONSE_INVALID');
  const reader = response.body.getReader(), chunks = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      need(value instanceof Uint8Array, 'FIXTURE_RESPONSE_INVALID'); length += value.byteLength;
      need(length <= MAX_BODY_BYTES, 'FIXTURE_RESPONSE_TOO_LARGE'); chunks.push(Buffer.from(value));
    }
    try { return JSON.parse(Buffer.concat(chunks, length).toString('utf8')); }
    catch { throw new FixtureError('FIXTURE_RESPONSE_INVALID'); }
  } catch (error) { try { await reader.cancel(); } catch { /* no raw diagnostics */ } throw error; }
  finally { reader.releaseLock(); }
}
async function request(fetchImpl, token, method, route, body) {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const response = await fetchImpl(API + route, { method, redirect: 'error', signal,
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await readBody(response);
    need(Number.isInteger(response.status) && response.status >= 200 && response.status <= 299, 'FIXTURE_HTTP_FAILED');
    return data;
  } catch (error) {
    if (error instanceof FixtureError) throw error;
    throw new FixtureError(signal.aborted || ['TimeoutError', 'AbortError'].includes(error?.name) ? 'FIXTURE_TIMEOUT' : 'FIXTURE_NETWORK_ERROR');
  }
}
function freezeFixture(value) {
  for (const item of value.cart.items) { Object.freeze(item.attributes); Object.freeze(item); }
  Object.freeze(value.cart.items); Object.freeze(value.cart); Object.freeze(value.profile); Object.freeze(value.target);
  Object.defineProperty(value, 'toJSON', { value() { throw new FixtureError('FIXTURE_INVALID'); }, enumerable: false });
  Object.freeze(value); baselines.add(value); return value;
}
function validateFixture(value) { try { return record(value) && baselines.has(value) && Object.isFrozen(value); } catch { return false; } }
function authFailure(report) { return report?.accessTokenReceived && !report.logoutConfirmed ? 'FIXTURE_AUTH_CLEANUP_FAILED' : 'FIXTURE_AUTH_FAILED'; }
function validateCaptureReport(value) {
  try { return exactKeys(value, ['authReport', 'fixture', 'errorCode']) && validateProbeReport(value.authReport) && ERROR_CODES.includes(value.errorCode) &&
    (value.errorCode === 'NONE' ? value.authReport.status === 'passed' && validateFixture(value.fixture) : value.fixture === null); } catch { return false; }
}
async function captureFixture({ email, password, fetchImpl = globalThis.fetch } = {}) {
  let fixture = null, errorCode = 'NONE';
  const authReport = await probeAccountAuth({ email, password, fetchImpl, onAuthenticated: async token => {
    try {
      const profile = parseProfile(await request(fetchImpl, token, 'GET', '/users/profile'), true);
      need(profile.email === email.trim().toLowerCase(), 'FIXTURE_PROFILE_INVALID');
      const cart = parseCart(await request(fetchImpl, token, 'GET', '/products/cart'));
      need(cart.items.length > 0, 'FIXTURE_EMPTY');
      const target = cart.items.find(item => item.active && item.quantity <= 98 && item.stock >= item.quantity + 1);
      need(target, 'FIXTURE_STOCK');
      need(cart.items.filter(item => item.name === target.name).length === 1, 'FIXTURE_TARGET_AMBIGUOUS');
      const variant = parseVariant(await request(fetchImpl, token, 'GET', '/products/get-product-details/' + target.productId), target);
      need(variant.stock >= target.quantity + 1, 'FIXTURE_STOCK');
      need(target.unitPrice === variant.currentPrice, 'FIXTURE_PRICE_CHANGED');
      fixture = { profile, cart, target: { ...target, currentPrice: variant.currentPrice, selectorLabel: variant.selectorLabel } };
    } catch (error) { errorCode = safeFixtureCode(error); throw new FixtureError(errorCode); }
  } });
  if (authReport.status !== 'passed') {
    if (authReport.accessTokenReceived && !authReport.logoutConfirmed) errorCode = 'FIXTURE_AUTH_CLEANUP_FAILED';
    else if (errorCode === 'NONE') errorCode = authFailure(authReport);
    fixture = null;
  } else if (fixture) fixture = freezeFixture(fixture);
  else errorCode = 'FIXTURE_UNEXPECTED';
  return { authReport, fixture, errorCode };
}
function validateMutationState(value) {
  try { return exactKeys(value, STATE_KEYS) && STATE_KEYS.every(key => typeof value[key] === 'boolean') &&
    (!value.cartRemoveConfirmed || value.cartRemoveAttempted) && (!value.cartAddAttempted || value.cartRemoveConfirmed); } catch { return false; }
}
function profileOthersMatch(current, fixture) { return PROFILE_KEYS.filter(key => key !== 'nombre').every(key => current[key] === fixture.profile[key]); }
function lineIdentity(item) { return { variantId: item.variantId, productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice }; }
function sortedLines(items) { return items.map(lineIdentity).sort((a, b) => a.variantId - b.variantId); }
function cartOthersMatch(current, fixture) {
  return current.id === fixture.cart.id && isDeepStrictEqual(sortedLines(current.items.filter(item => item.variantId !== fixture.target.variantId)),
    sortedLines(fixture.cart.items.filter(item => item.variantId !== fixture.target.variantId)));
}
function cartTargetRestored(current, fixture) {
  const target = current.items.find(item => item.variantId === fixture.target.variantId);
  return !!target && isDeepStrictEqual(lineIdentity(target), lineIdentity(fixture.target));
}
const emptyRestoration = () => Object.fromEntries(RESTORATION_KEYS.map(key => [key, false]));
function validateRestorationReport(value) {
  try {
    if (!exactKeys(value, ['authReport', 'restoration', 'errorCode']) || !ERROR_CODES.includes(value.errorCode) ||
      value.authReport !== null && !validateProbeReport(value.authReport) || !exactKeys(value.restoration, RESTORATION_KEYS) ||
      !RESTORATION_KEYS.every(key => typeof value.restoration[key] === 'boolean')) return false;
    const r = value.restoration, confirmed = r.profileRestored && r.cartRestored && r.otherProfileFieldsUnchanged &&
      r.otherCartLinesUnchanged && !r.mutationUncertain && !r.concurrentChangeObserved && value.authReport?.status === 'passed';
    return r.baselineRestored === confirmed && (value.errorCode === 'NONE') === confirmed;
  } catch { return false; }
}
async function restoreFixture({ email, password, fixture, mutationState, uiStopped, fetchImpl = globalThis.fetch } = {}) {
  const restoration = emptyRestoration();
  if (uiStopped !== true) return { authReport: null, restoration, errorCode: 'FIXTURE_UI_NOT_STOPPED' };
  if (!validateFixture(fixture)) return { authReport: null, restoration, errorCode: 'FIXTURE_INVALID' };
  if (!validateMutationState(mutationState)) return { authReport: null, restoration, errorCode: 'FIXTURE_STATE_INVALID' };
  const state = { ...mutationState }; let errorCode = 'NONE', callbackCompleted = false;
  const authReport = await probeAccountAuth({ email, password, fetchImpl, onAuthenticated: async token => {
    try {
      let currentProfile = parseProfile(await request(fetchImpl, token, 'GET', '/users/profile'));
      let currentCart = parseCart(await request(fetchImpl, token, 'GET', '/products/cart'));
      const othersProfile = profileOthersMatch(currentProfile, fixture), othersCart = cartOthersMatch(currentCart, fixture);
      if (!othersProfile || !othersCart) restoration.concurrentChangeObserved = true;
      if (othersProfile && currentProfile.nombre !== fixture.profile.nombre) {
        if (currentProfile.nombre === TEST_NAME && state.profileNameAttempted) {
          // Server has no CAS: only the reserved account and a checked preimage permit this partial PATCH.
          try { parseProfile((await request(fetchImpl, token, 'PATCH', '/users/update-profile', { nombre: fixture.profile.nombre })).user); }
          catch { /* No replay: the final GET alone can reconcile a lost response. */ }
        } else restoration.concurrentChangeObserved = true;
      }
      const target = currentCart.items.find(item => item.variantId === fixture.target.variantId);
      if (othersCart && !cartTargetRestored(currentCart, fixture)) {
        if (target && state.cartIncrementAttempted && !state.cartRemoveAttempted && target.productId === fixture.target.productId &&
          target.quantity === fixture.target.quantity + 1 && target.unitPrice === fixture.target.unitPrice) {
          const variant = parseVariant(await request(fetchImpl, token, 'GET', '/products/get-product-details/' + fixture.target.productId), fixture.target);
          need(variant.currentPrice === fixture.target.currentPrice, 'FIXTURE_PRICE_CHANGED');
          need(target.active && variant.stock >= fixture.target.quantity, 'FIXTURE_STOCK');
          try { parseCart(await request(fetchImpl, token, 'PUT', '/products/cart/items/' + fixture.target.variantId, { cantidad: fixture.target.quantity })); }
          catch { /* Read after the one write; no automatic mutation replay. */ }
        } else if (!target && state.cartRemoveConfirmed && !state.cartAddAttempted) {
          const variant = parseVariant(await request(fetchImpl, token, 'GET', '/products/get-product-details/' + fixture.target.productId), fixture.target);
          need(variant.currentPrice === fixture.target.currentPrice, 'FIXTURE_PRICE_CHANGED');
          need(variant.stock >= fixture.target.quantity, 'FIXTURE_STOCK');
          try { parseCart(await request(fetchImpl, token, 'POST', '/products/cart/items', { id_variante: fixture.target.variantId, cantidad: fixture.target.quantity })); }
          catch { /* The additive POST is attempted exactly once; reconcile below. */ }
        } else if (!target && state.cartAddAttempted) restoration.mutationUncertain = true;
        else restoration.concurrentChangeObserved = true;
      }
      currentProfile = parseProfile(await request(fetchImpl, token, 'GET', '/users/profile'));
      currentCart = parseCart(await request(fetchImpl, token, 'GET', '/products/cart'));
      restoration.profileRestored = currentProfile.nombre === fixture.profile.nombre;
      restoration.cartRestored = cartTargetRestored(currentCart, fixture);
      restoration.otherProfileFieldsUnchanged = profileOthersMatch(currentProfile, fixture);
      restoration.otherCartLinesUnchanged = cartOthersMatch(currentCart, fixture);
      if (!restoration.otherProfileFieldsUnchanged || !restoration.otherCartLinesUnchanged) restoration.concurrentChangeObserved = true;
      // A final matching GET resolves an earlier additive attempt; an absent line never proves it was not processed.
      if (restoration.cartRestored) restoration.mutationUncertain = false;
      else if (!currentCart.items.some(item => item.variantId === fixture.target.variantId) && (state.cartAddAttempted || state.cartRemoveConfirmed)) restoration.mutationUncertain = true;
      callbackCompleted = true;
    } catch (error) { errorCode = safeFixtureCode(error); throw new FixtureError(errorCode); }
  } });
  if (authReport.status !== 'passed') {
    if (authReport.accessTokenReceived && !authReport.logoutConfirmed) errorCode = 'FIXTURE_AUTH_CLEANUP_FAILED';
    else if (errorCode === 'NONE') errorCode = authFailure(authReport);
  }
  restoration.baselineRestored = callbackCompleted && authReport.status === 'passed' && restoration.profileRestored && restoration.cartRestored &&
    restoration.otherProfileFieldsUnchanged && restoration.otherCartLinesUnchanged && !restoration.concurrentChangeObserved && !restoration.mutationUncertain;
  if (restoration.baselineRestored) errorCode = 'NONE';
  else if (errorCode === 'NONE') errorCode = restoration.mutationUncertain ? 'FIXTURE_MUTATION_UNCERTAIN'
    : restoration.concurrentChangeObserved ? 'FIXTURE_CONFLICT' : 'FIXTURE_RESTORE_FAILED';
  return { authReport, restoration, errorCode };
}
module.exports = { TEST_NAME, PROFILE_KEYS, STATE_KEYS, RESTORATION_KEYS, ERROR_CODES, safeFixtureCode,
  parseProfile, parseCart, parseVariant, validateFixture, validateMutationState, validateCaptureReport, validateRestorationReport,
  captureFixture, restoreFixture };
