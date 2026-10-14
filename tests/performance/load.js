import { count, loadThresholds, setupTarget, readProducts, report } from './common.js';

export const options = {
  vus: count('LOAD_VUS', 1),
  duration: `${count('DURATION_SECONDS', 10, 120)}s`,
  thresholds: loadThresholds(),
};
export const setup = setupTarget;
export default function (target) { readProducts(target); }
export function handleSummary(data) { return report(data, 'load'); }
