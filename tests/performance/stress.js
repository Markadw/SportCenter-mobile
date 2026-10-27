import exec from 'k6/execution';
import { Counter, Trend } from 'k6/metrics';
import { count, setupTarget, readProducts, report } from './common.js';

const normal = count('LOAD_VUS', 2);
const peak = count('STRESS_VUS', 8);
if (peak <= normal) throw new Error('STRESS_VUS debe superar la carga normal.');
const ramp = count('RAMP_SECONDS', 10, 60);
const hold = count('HOLD_SECONDS', 20, 120);
const down = count('DOWN_SECONDS', 10, 60);
const stop = count('STOP_SECONDS', 5, 30);
const stressEnd = ramp + hold + down + stop;
const observe = count('OBSERVE_RECOVERY_SECONDS', 70, 120);
const verify = count('VERIFY_RECOVERY_SECONDS', 20, 120);
const recoveryLimit = count('RECOVERY_LIMIT_MS', 65000, 120000);
const recoveryTime = new Trend('recovery_time_ms');
const observed = new Counter('recovery_observed');
const verified = new Counter('recovery_valid_samples');
let recovered = false;
export const options = {
  scenarios: {
    stress: { executor: 'ramping-vus', startVUs: normal, stages: [
      { duration: ramp + 's', target: peak }, { duration: hold + 's', target: peak },
      { duration: down + 's', target: normal }, { duration: stop + 's', target: 0 },
    ], gracefulRampDown: '0s', gracefulStop: '0s' },
    observeRecovery: { executor: 'constant-vus', vus: 1, duration: observe + 's', startTime: stressEnd + 's', exec: 'observeRecovery', gracefulStop: '0s' },
    verifyRecovery: { executor: 'constant-vus', vus: normal, duration: verify + 's',
      startTime: (stressEnd + observe) + 's', exec: 'verifyRecovery', gracefulStop: '0s' },
  },
  thresholds: {
    'rate_limited_responses{scenario:stress}': ['count>0'],
    unexpected_responses: ['count==0'],
    recovery_observed: ['count>=1'],
    recovery_time_ms: ['max<=' + recoveryLimit],
    recovery_valid_samples: ['count>=1'],
    'http_req_failed{scenario:verifyRecovery}': ['rate==0'],
    'checks{scenario:verifyRecovery}': ['rate==1'],
  },
};
export const setup = setupTarget;
export default function (target) { readProducts(target); }
export function observeRecovery(target) {
  const sample = readProducts(target);
  const healthy = sample.healthy;
  observed.add(Number(healthy && !recovered));
  if (healthy && !recovered) {
    recovered = true;
    recoveryTime.add(sample.sampledAt - exec.scenario.startTime);
  }
}
export function verifyRecovery(target) { verified.add(Number(readProducts(target).healthy)); }
export function handleSummary(data) { return report(data, 'stress'); }
