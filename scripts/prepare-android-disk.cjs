'use strict';
// Only the disposable GitHub-hosted Linux VM; requiring this module performs no operations.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path').posix;
const RUNNER_HOME = '/home/runner', ANDROID_USER_DIR = RUNNER_HOME + '/.android', AVD = ANDROID_USER_DIR + '/avd';
const DOTNET = '/usr/share/dotnet', REQUIRED_BYTES = 12 * 1024 ** 3;
const REMOVE_ARGS = Object.freeze(['-n', '/usr/bin/rm', '-rf', '--one-file-system', '--', DOTNET]);
class DiskError extends Error {
  constructor(code, report) { super(code); this.code = code; this.report = report; }
}
const need = (value, code) => { if (!value) throw new DiskError(code); };
function checkScope(env, platform) {
  need(platform === 'linux' && env.GITHUB_ACTIONS === 'true' && env.RUNNER_ENVIRONMENT === 'github-hosted'
    && env.PINNING_EPHEMERAL_AVD === 'true', 'ANDROID_DISK_HOSTED_VM_REQUIRED');
  need(env.HOME === RUNNER_HOME && (!env.ANDROID_AVD_HOME || env.ANDROID_AVD_HOME === AVD)
    && (!env.ANDROID_USER_HOME || env.ANDROID_USER_HOME === ANDROID_USER_DIR)
    && (!env.ANDROID_EMULATOR_HOME || env.ANDROID_EMULATOR_HOME === ANDROID_USER_DIR)
    && (!env.ANDROID_SDK_HOME || env.ANDROID_SDK_HOME === RUNNER_HOME), 'ANDROID_DISK_PATH_SCOPE');
}
function directory(file, io) {
  const pieces = file.split('/').filter(Boolean); let current = '/';
  for (const piece of ['', ...pieces]) {
    if (piece) current = path.join(current, piece);
    const stat = io.lstatSync(current);
    need(stat.isDirectory() && !stat.isSymbolicLink() && io.realpathSync(current) === current, 'ANDROID_DISK_UNSAFE_PATH');
  }
  return io.lstatSync(file);
}
function nearestAvd(io) {
  for (const file of [AVD, ANDROID_USER_DIR, RUNNER_HOME]) {
    try { directory(file, io); return file; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  throw new DiskError('ANDROID_DISK_UNSAFE_PATH');
}
function available(file, io) {
  const stat = io.statfsSync(file, { bigint: true });
  need(typeof stat.bavail === 'bigint' && typeof stat.bsize === 'bigint'
    && stat.bavail >= 0n && stat.bsize > 0n, 'ANDROID_DISK_MEASUREMENT_FAILED');
  const bytes = stat.bavail * stat.bsize;
  need(bytes <= BigInt(Number.MAX_SAFE_INTEGER), 'ANDROID_DISK_MEASUREMENT_FAILED'); return Number(bytes);
}
function measure(io) {
  directory(RUNNER_HOME, io); const avdFilesystemPath = nearestAvd(io);
  return { homeAvailableBytes: available(RUNNER_HOME, io), avdAvailableBytes: available(avdFilesystemPath, io), avdFilesystemPath };
}
function cleanupTarget(file, io) {
  need(file === DOTNET, 'ANDROID_DISK_PATH_SCOPE'); return directory(file, io);
}
function prepareAndroidDisk({ env = process.env, platform = process.platform, io = fs, run = execFileSync } = {}) {
  const report = { scope: 'ephemeral-github-hosted-linux-android', requiredBytes: REQUIRED_BYTES,
    before: null, after: null, cleanupAttempted: false, cleanupPerformed: false, status: 'failed' };
  try {
    checkScope(env, platform); report.before = measure(io);
    const enough = value => Math.min(value.homeAvailableBytes, value.avdAvailableBytes) >= REQUIRED_BYTES;
    if (!enough(report.before)) {
      let target;
      try { target = cleanupTarget(DOTNET, io); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (target) {
        const low = [[RUNNER_HOME, report.before.homeAvailableBytes], [report.before.avdFilesystemPath, report.before.avdAvailableBytes]]
          .filter(([, bytes]) => bytes < REQUIRED_BYTES);
        need(low.some(([file]) => io.lstatSync(file).dev === target.dev), 'ANDROID_DISK_DIFFERENT_FILESYSTEM');
        report.cleanupAttempted = true;
        run('/usr/bin/sudo', [...REMOVE_ARGS], { timeout: 120000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let absent = false; try { io.lstatSync(DOTNET); } catch (error) { if (error.code === 'ENOENT') absent = true; else throw error; }
        need(absent, 'ANDROID_DISK_CLEANUP_FAILED'); report.cleanupPerformed = true;
      }
    }
    report.after = measure(io); need(enough(report.after), 'ANDROID_DISK_INSUFFICIENT');
    report.status = 'passed'; return report;
  } catch (error) {
    if (error instanceof DiskError) { error.report = report; throw error; }
    throw new DiskError(report.cleanupAttempted ? 'ANDROID_DISK_CLEANUP_FAILED' : 'ANDROID_DISK_MEASUREMENT_FAILED', report);
  }
}
module.exports = { RUNNER_HOME, AVD, DOTNET, REQUIRED_BYTES, REMOVE_ARGS, DiskError, checkScope, cleanupTarget, prepareAndroidDisk };
if (require.main === module) {
  try {
    need(process.argv.length === 2, 'ANDROID_DISK_PATH_SCOPE');
    process.stdout.write(JSON.stringify(prepareAndroidDisk()) + '\n');
  } catch (error) {
    process.stdout.write(JSON.stringify({ ...(error.report || { status: 'failed', requiredBytes: REQUIRED_BYTES }),
      errorCode: error instanceof DiskError ? error.code : 'ANDROID_DISK_MEASUREMENT_FAILED' }) + '\n');
    process.exitCode = 1;
  }
}
