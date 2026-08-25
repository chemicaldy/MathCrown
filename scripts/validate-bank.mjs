// validate-bank.mjs — Phase 2 step 3 (CI gate)
// Validates data/question_bank.json. Exits 1 on any violation.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const bank = JSON.parse(readFileSync(join(root, 'data', 'question_bank.json'), 'utf8'));

const normalize = (s) => String(s).trim().replace(/\s+/g, ' ').toLowerCase();
const errors = [];
let total = 0;

const CIRC_RE = /circumference[^]*?\br\s*=\s*(\d+(?:\.\d+)?)[^]*?π\s*≈\s*3\.14/i;
const ROUND_RE = /^Round\s+(\d+)\s+to\s+the\s+nearest\s+ten\.?\s*$/i;
const PCT_RE = /^What\s+%\s+of\s+(\d+(?:\.\d+)?)\s+is\s+(\d+(?:\.\d+)?)\?\s*$/i;
const Z_RE = /^Z-score:\s*x\s*=\s*(-?\d+(?:\.\d+)?)\s*,\s*μ\s*=\s*(-?\d+(?:\.\d+)?)\s*,\s*σ\s*=\s*(-?\d+(?:\.\d+)?)\s*\?\s*$/i;
const templateChecks = { circumference: 0, round: 0, percent: 0, zscore: 0 };

for (const band of Object.keys(bank)) {
  if (typeof bank[band] !== 'object') { errors.push(`band ${band} is not an object`); continue; }
  for (const topic of Object.keys(bank[band])) {
    const list = bank[band][topic];
    if (!Array.isArray(list)) { errors.push(`${band}.${topic} is not an array`); continue; }
    const seenQ = new Set();
    for (const item of list) {
      total++;
      const where = item && item.id ? item.id : `${band}.${topic}[?]`;
      if (!item || typeof item.id !== 'string' || item.id.length === 0) errors.push(`${where}: missing id`);
      if (typeof item.q !== 'string' || item.q.trim() === '') errors.push(`${where}: missing/empty q`);
      if (!Array.isArray(item.a) || item.a.length !== 4) {
        errors.push(`${where}: a must be exactly 4 options`);
        continue;
      }
      for (let i = 0; i < 4; i++) {
        if (typeof item.a[i] !== 'string' || item.a[i].trim() === '') {
          errors.push(`${where}: option ${i} is not a non-empty string`);
        }
      }
      if (!Number.isInteger(item.c) || item.c < 0 || item.c > 3) {
        errors.push(`${where}: c=${item.c} out of range`);
        continue;
      }
      const normOpts = item.a.map(normalize);
      if (new Set(normOpts).size !== 4) {
        errors.push(`${where}: duplicate options ${JSON.stringify(item.a)}`);
      }
      const qKey = normalize(item.q);
      if (seenQ.has(qKey)) errors.push(`${where}: duplicate question text within ${band}.${topic}`);
      seenQ.add(qKey);

      // re-verify the four math templates
      const markedVal = Number(item.a[item.c]);
      let m;
      if ((m = CIRC_RE.exec(item.q))) {
        templateChecks.circumference++;
        const expected = Number((2 * 3.14 * Number(m[1])).toFixed(2));
        if (!Number.isFinite(markedVal) || Math.abs(markedVal - expected) > 1e-9) {
          errors.push(`${where}: circumference expected ${expected}, marked "${item.a[item.c]}"`);
        }
      } else if ((m = ROUND_RE.exec(item.q))) {
        templateChecks.round++;
        const expected = Math.round(Number(m[1]) / 10) * 10;
        if (markedVal !== expected) {
          errors.push(`${where}: round expected ${expected}, marked "${item.a[item.c]}"`);
        }
      } else if ((m = PCT_RE.exec(item.q))) {
        templateChecks.percent++;
        const x = Number(m[1]);
        if (x !== 0) {
          const expected = Math.round((100 * Number(m[2])) / x);
          if (markedVal !== expected) {
            errors.push(`${where}: percent expected ${expected}, marked "${item.a[item.c]}"`);
          }
        }
      } else if ((m = Z_RE.exec(item.q))) {
        templateChecks.zscore++;
        const sigma = Number(m[3]);
        if (sigma !== 0) {
          const expected = Number(((Number(m[1]) - Number(m[2])) / sigma).toFixed(4));
          if (!Number.isFinite(markedVal) || Math.abs(markedVal - expected) > 1e-9) {
            errors.push(`${where}: z-score expected ${expected}, marked "${item.a[item.c]}"`);
          }
        }
      }
    }
  }
}

console.log(`validate-bank: total questions: ${total}`);
console.log(`validate-bank: template re-verification counts: ${JSON.stringify(templateChecks)}`);
if (errors.length > 0) {
  console.error(`validate-bank: ${errors.length} violation(s):`);
  for (const e of errors.slice(0, 50)) console.error('  - ' + e);
  if (errors.length > 50) console.error(`  ... and ${errors.length - 50} more`);
  process.exit(1);
}
console.log('validate-bank: OK');
