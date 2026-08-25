// convert-bank.mjs — Phase 2 step 1
// Loads the frozen raw question_bank.js (global `var QUESTION_BANK`) and emits
// data/question_bank.raw.json in shape {band: {topic: [{id, q, a, c}]}}.
// ids are `${band}.${topic}.${originalIndex}` derived from raw file position,
// so they are stable across re-runs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const srcPath = join(root, 'question_bank.js');
const outDir = join(root, 'data');
const outPath = join(outDir, 'question_bank.raw.json');

const code = readFileSync(srcPath, 'utf8');
const context = vm.createContext({});
vm.runInContext(code, context, { filename: 'question_bank.js' });
const bank = context.QUESTION_BANK;
if (!bank || typeof bank !== 'object') {
  console.error('convert-bank: QUESTION_BANK not found after evaluating question_bank.js');
  process.exit(1);
}

const out = {};
let total = 0;
let malformed = 0;
for (const band of Object.keys(bank)) {
  out[band] = {};
  for (const topic of Object.keys(bank[band])) {
    const list = bank[band][topic];
    if (!Array.isArray(list)) continue;
    out[band][topic] = list.map((item, i) => {
      if (
        !item || typeof item.q !== 'string' || !Array.isArray(item.a) ||
        item.a.length !== 4 || !Number.isInteger(item.c) || item.c < 0 || item.c > 3
      ) {
        malformed++;
      }
      total++;
      return {
        id: `${band}.${topic}.${i}`,
        q: String(item.q),
        a: item.a.map(String),
        c: item.c,
      };
    });
  }
}

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 1) + '\n');
console.log(`convert-bank: wrote ${outPath}`);
console.log(`convert-bank: bands=${Object.keys(out).length} questions=${total} malformed=${malformed}`);
if (malformed > 0) process.exit(1);
