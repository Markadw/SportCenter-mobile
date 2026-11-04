/** @jest-environment node */
'use strict';
const { test } = require('@jest/globals');
const assert = require('node:assert/strict');
const guard = require('../scripts/prepare-android-disk.cjs');
const goodEnv = () => ({ GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', PINNING_EPHEMERAL_AVD: 'true', HOME: '/home/runner' });
const GiB = 1024 ** 3;
function fixture({ before = 13 * GiB, after = 13 * GiB, missingDotnet = false, failRemove = false, keepDotnet = false,
  missingAvd = false, avdSpace, avdDevice = 1 } = {}) {
  const calls = [], links = new Set(); let removed = false;
  const io = {
    lstatSync(file) {
      calls.push(['lstat', file]);
      if ((file === guard.DOTNET && (removed || missingDotnet)) || (missingAvd && file === guard.AVD)) {
        const error = new Error('missing fixture'); error.code = 'ENOENT'; throw error;
      }
      return { isDirectory: () => true, isSymbolicLink: () => links.has(file), dev: file === guard.AVD ? avdDevice : 1 };
    },
    realpathSync: file => file,
    statfsSync(file, options) {
      calls.push(['statfs', file, options]);
      return { bavail: BigInt(file === guard.AVD && avdSpace !== undefined ? avdSpace : removed ? after : before), bsize: 1n };
    },
  };
  const run = (file, args, options) => {
    calls.push(['run', file, args, options]);
    if (failRemove) throw Error('private subprocess failure');
    removed = !keepDotnet;
  };
  return { io, run, calls, links, args: { env: goodEnv(), platform: 'linux', io, run } };
}
test('never touches filesystem or sudo outside the hosted Linux ephemeral contract', () => {
  const invalid = [{ platform: 'win32' }, { platform: 'darwin' },
    ...['GITHUB_ACTIONS', 'RUNNER_ENVIRONMENT', 'PINNING_EPHEMERAL_AVD'].map(key => ({ env: { ...goodEnv(), [key]: undefined } })),
    { env: { ...goodEnv(), RUNNER_ENVIRONMENT: 'self-hosted' } }, { env: { ...goodEnv(), GITHUB_ACTIONS: 'false' } }];
  for (const change of invalid) {
    const f = fixture(); assert.throws(() => guard.prepareAndroidDisk({ ...f.args, ...change }), /ANDROID_DISK_HOSTED_VM_REQUIRED/);
    assert.deepEqual(f.calls, []);
  }
});
test('rejects any alternative home or AVD location before filesystem or deletion', () => {
  for (const change of [{ HOME: 'C:/Users/person' }, { HOME: '/root' }, { ANDROID_AVD_HOME: '/tmp/avd' },
    { ANDROID_USER_HOME: '/tmp' }, { ANDROID_EMULATOR_HOME: '/tmp' }, { ANDROID_SDK_HOME: '/usr/local/lib/android/sdk' }]) {
    const f = fixture(); assert.throws(() => guard.prepareAndroidDisk({ ...f.args, env: { ...goodEnv(), ...change } }), /ANDROID_DISK_PATH_SCOPE/);
    assert.deepEqual(f.calls, []);
  }
  const f = fixture(); assert.throws(() => guard.cleanupTarget('/usr/local/lib/android/sdk', f.io), /ANDROID_DISK_PATH_SCOPE/);
  assert.deepEqual(f.calls, []);
});
test('home, AVD, dotnet and ancestor symlinks or realpath redirection never reach sudo', () => {
  for (const link of ['/home', '/home/runner', '/home/runner/.android', guard.AVD, '/usr', '/usr/share', guard.DOTNET]) {
    const f = fixture({ before: GiB }); f.links.add(link);
    assert.throws(() => guard.prepareAndroidDisk(f.args), /ANDROID_DISK_UNSAFE_PATH/);
    assert.ok(!f.calls.some(c => c[0] === 'run'));
  }
  const f = fixture({ before: GiB }); f.io.realpathSync = file => file === guard.DOTNET ? '/different' : file;
  assert.throws(() => guard.prepareAndroidDisk(f.args), /ANDROID_DISK_UNSAFE_PATH/);
  assert.ok(!f.calls.some(c => c[0] === 'run'));
});
test('sufficient space avoids cleanup and measures HOME and AVD with bigint stats', () => {
  const f = fixture(); const report = guard.prepareAndroidDisk(f.args);
  assert.equal(report.status, 'passed'); assert.equal(report.requiredBytes, 12 * GiB);
  assert.equal(report.cleanupAttempted, false); assert.ok(!f.calls.some(c => c[0] === 'run'));
  assert.ok(f.calls.filter(c => c[0] === 'statfs').every(c => c[2].bigint === true));
});
test('when AVD does not exist yet, measures its verified existing parent without creating it', () => {
  const f = fixture({ missingAvd: true }); const report = guard.prepareAndroidDisk(f.args);
  assert.equal(report.before.avdFilesystemPath, '/home/runner/.android'); assert.equal(report.status, 'passed');
});
test('low space removes only literal dotnet with exact argv and then requires the postcondition', () => {
  const f = fixture({ before: 6 * GiB, after: 12 * GiB }); const report = guard.prepareAndroidDisk(f.args);
  const calls = f.calls.filter(c => c[0] === 'run'); assert.equal(calls.length, 1);
  assert.equal(calls[0][1], '/usr/bin/sudo');
  assert.deepEqual(calls[0][2], ['-n', '/usr/bin/rm', '-rf', '--one-file-system', '--', '/usr/share/dotnet']);
  assert.equal(calls[0][3].timeout, 120000); assert.equal(report.cleanupPerformed, true); assert.equal(report.status, 'passed');
});
test('insufficient post-cleanup space fails early and retains numeric measurements', () => {
  const f = fixture({ before: 6 * GiB, after: 8 * GiB });
  assert.throws(() => guard.prepareAndroidDisk(f.args), error => error.code === 'ANDROID_DISK_INSUFFICIENT'
    && error.report.before.homeAvailableBytes === 6 * GiB && error.report.after.avdAvailableBytes === 8 * GiB);
  assert.equal(f.calls.filter(c => c[0] === 'run').length, 1);
});
test('missing dotnet does not expand deletion to any other directory', () => {
  const f = fixture({ before: GiB, missingDotnet: true });
  assert.throws(() => guard.prepareAndroidDisk(f.args), /ANDROID_DISK_INSUFFICIENT/);
  assert.ok(!f.calls.some(c => c[0] === 'run'));
});
test('sudo failure or a remaining target fails without raw subprocess text', () => {
  for (const options of [{ failRemove: true }, { keepDotnet: true }]) {
    const f = fixture({ before: GiB, ...options });
    assert.throws(() => guard.prepareAndroidDisk(f.args), error => error.code === 'ANDROID_DISK_CLEANUP_FAILED'
      && !error.message.includes('private subprocess failure'));
  }
});
test('an unrelated filesystem is not cleaned when only AVD is short on space', () => {
  const f = fixture({ before: 13 * GiB, avdSpace: GiB, avdDevice: 2 });
  assert.throws(() => guard.prepareAndroidDisk(f.args), /ANDROID_DISK_DIFFERENT_FILESYSTEM/);
  assert.ok(!f.calls.some(c => c[0] === 'run'));
});
test('bad filesystem measurements fail closed without deletion', () => {
  const f = fixture(); f.io.statfsSync = () => ({ bavail: -1n, bsize: 4096n });
  assert.throws(() => guard.prepareAndroidDisk(f.args), /ANDROID_DISK_MEASUREMENT_FAILED/);
  assert.ok(!f.calls.some(c => c[0] === 'run'));
});
