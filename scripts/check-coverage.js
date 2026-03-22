#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const summaryPath = path.join(__dirname, '..', 'coverage', 'coverage-summary.json');

if (!fs.existsSync(summaryPath)) {
  console.error('Coverage summary not found. Run tests with --coverage first.');
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
const total = summary.total;

const thresholds = {
  lines: 80,
  branches: 75,
  functions: 80,
  statements: 80,
};

let failed = false;

for (const [metric, threshold] of Object.entries(thresholds)) {
  const actual = total[metric].pct;
  if (actual < threshold) {
    console.error(`Coverage for ${metric} (${actual}%) is below threshold (${threshold}%)`);
    failed = true;
  } else {
    console.log(`${metric}: ${actual}% >= ${threshold}% ✓`);
  }
}

if (failed) {
  process.exit(1);
}

console.log('\nAll coverage thresholds met.');
