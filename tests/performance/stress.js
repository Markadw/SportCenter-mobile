import { count, setupTarget, readProducts, report } from './common.js';

const normal = count('LOAD_VUS', 1);
const peak = count('STRESS_VUS', 3);
if (peak <= normal) throw new Error('STRESS_VUS debe superar la carga normal configurada.');
export const options = {
  scenarios: {
    stress: { executor: 'ramping-vus', startVUs: normal, stages: [
      { duration: '3s', target: peak }, { duration: '6s', target: peak },
      { duration: '3s', target: normal }, { duration: '3s', target: 0 },
    ], gracefulRampDown: '0s', gracefulStop: '0s' },
    recovery: { executor: 'constant-vus', vus: normal, duration: '5s', startTime: '16s', exec: 'recovery' },
  },
  // El exceso de carga se observa; se exige recuperar respuestas correctas al reducirla.
  thresholds: { 'http_req_failed{scenario:recovery}': ['rate==0'], 'checks{scenario:recovery}': ['rate==1'] },
};
export const setup = setupTarget;
export default function (target) { readProducts(target); }
export function recovery(target) { readProducts(target); }
export function handleSummary(data) { return report(data, 'stress'); }
