import { readFileSync } from 'node:fs';

const governedFiles = ['server/timing-intelligence.ts'];
const violations = [];
for (const file of governedFiles) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    if (line.includes('Math.random(')) violations.push(`${file}:${index + 1}: ${line.trim()}`);
  });
}
if (violations.length) {
  console.error('Non-deterministic model code found:\n' + violations.join('\n'));
  process.exit(1);
}
console.log(`model determinism checks passed (${governedFiles.length} governed files)`);
