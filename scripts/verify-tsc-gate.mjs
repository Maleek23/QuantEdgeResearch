import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const budget = JSON.parse(readFileSync(new URL('../.ts-error-budget.json', import.meta.url), 'utf8'));
const run = spawnSync('npx', ['tsc', '--noEmit', '-p', 'tsconfig.json'], { encoding: 'utf8' });
const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
const errors = output.split('\n').filter((line) => /error TS\d+:/.test(line));
const zeroTolerance = [
  /^client\/src\/components\/trade-desk\//,
  /^shared\/conviction/,
  /^shared\/grading\.ts/,
  /^shared\/conviction-bands\.ts/,
  /^client\/src\/lib\/conviction-display\.ts/,
  /^server\/backtest-execution-engine\.ts/,
];
const violations = errors.filter((line) => zeroTolerance.some((pattern) => pattern.test(line)));

console.log(`tsc errors total: ${errors.length} (baseline cap: ${budget.baseline})`);
console.log(`zero-tolerance path errors: ${violations.length}`);
if (errors.length > budget.baseline || violations.length) {
  if (violations.length) console.error(violations.join('\n'));
  process.exit(1);
}
