// report-bank.mjs — Phase 2 step 4
// Human-readable summary of data/fix-report.json.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const report = JSON.parse(readFileSync(join(root, 'data', 'fix-report.json'), 'utf8'));

const byKind = {};
const byBandTopic = {};
for (const r of report) {
  byKind[r.kind] = (byKind[r.kind] || 0) + 1;
  const [band, topic] = r.id.split('.');
  const key = `${band}/${topic}`;
  byBandTopic[key] = byBandTopic[key] || {};
  byBandTopic[key][r.kind] = (byBandTopic[key][r.kind] || 0) + 1;
}

console.log('=== MathCrown question-bank fix report ===\n');
console.log(`Total changes: ${report.length}\n`);

console.log('Counts per fix kind:');
for (const [kind, n] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${kind.padEnd(20)} ${n}`);
}
const dupOptQ = new Set(report.filter((r) => r.kind === 'duplicate-option').map((r) => r.id)).size;
console.log(`  (duplicate-option changes span ${dupOptQ} distinct questions)\n`);

console.log('Per band/topic:');
const kinds = Object.keys(byKind).sort();
const header = ['band/topic'.padEnd(34), ...kinds.map((k) => k.slice(0, 12).padEnd(13))].join('');
console.log('  ' + header);
for (const [key, kc] of Object.entries(byBandTopic).sort()) {
  const row = [key.padEnd(34), ...kinds.map((k) => String(kc[k] || 0).padEnd(13))].join('');
  console.log('  ' + row);
}

console.log('\n10 example diffs:');
// one example per kind first, then fill up to 10
const examples = [];
const usedIdx = new Set();
for (const kind of kinds) {
  const idx = report.findIndex((r) => r.kind === kind);
  if (idx !== -1) { examples.push(report[idx]); usedIdx.add(idx); }
}
for (let i = 0; i < report.length && examples.length < 10; i++) {
  if (!usedIdx.has(i)) { examples.push(report[i]); usedIdx.add(i); }
}
for (const ex of examples) {
  const before = ex.before === null ? 'null' : JSON.stringify(ex.before);
  const after = ex.after === null ? '(dropped)' : JSON.stringify(ex.after);
  console.log(`  [${ex.kind}] ${ex.id}${ex.index !== undefined ? ` slot ${ex.index}` : ''}${ex.keptId ? ` (kept ${ex.keptId})` : ''}`);
  console.log(`    before: ${before}`);
  console.log(`    after:  ${after}`);
}
