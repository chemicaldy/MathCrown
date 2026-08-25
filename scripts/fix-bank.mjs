// fix-bank.mjs — Phase 2 step 2
// Reads data/question_bank.raw.json, applies fixes 1-6 in order, writes
// data/question_bank.json and data/fix-report.json.
// Fully deterministic: no Math.random — distractor perturbations are derived
// from a string hash of the question id, so re-runs are byte-identical.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const rawPath = join(root, 'data', 'question_bank.raw.json');
const outPath = join(root, 'data', 'question_bank.json');
const reportPath = join(root, 'data', 'fix-report.json');

const bank = JSON.parse(readFileSync(rawPath, 'utf8'));
const report = [];

// ---------- helpers ----------
const normalize = (s) => String(s).trim().replace(/\s+/g, ' ').toLowerCase();

// FNV-1a 32-bit — deterministic seed source for distractor generation.
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function decimalsOf(numStr) {
  const dot = numStr.indexOf('.');
  return dot === -1 ? 0 : numStr.length - dot - 1;
}

// Format a number like a template string (same decimal places).
function formatLike(value, templateNumStr) {
  const d = decimalsOf(templateNumStr);
  return value.toFixed(d);
}

// Format a computed answer: integers plain, otherwise up to 2dp trimmed.
function formatAnswer(value) {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(2)));
}

const NUM_RE = /-?\d+(?:\.\d+)?/g;
function numericTokens(s) {
  const toks = [];
  let m;
  NUM_RE.lastIndex = 0;
  while ((m = NUM_RE.exec(s)) !== null) {
    toks.push({ text: m[0], start: m.index, end: m.index + m[0].length, value: Number(m[0]) });
  }
  return toks;
}

// Single numeric value of a string, or null if it isn't exactly one number
// (ignoring prefixes/suffixes like "$", "%", "x=", "°").
function soleNumber(s) {
  const toks = numericTokens(s);
  return toks.length === 1 ? toks[0].value : null;
}

function forEachQuestion(fn) {
  for (const band of Object.keys(bank)) {
    for (const topic of Object.keys(bank[band])) {
      for (const item of bank[band][topic]) fn(item, band, topic);
    }
  }
}

// Shared fixer for "expected numeric answer" templates (#2 #3 #4):
// if marked option is right leave it; else repoint c to a matching option;
// else replace the marked option's text with the correct value.
function fixExpected(item, kind, expected, fmt) {
  const markedVal = Number(item.a[item.c]);
  if (Number.isFinite(markedVal) && Math.abs(markedVal - expected) < 1e-9) return;
  const matchIdx = item.a.findIndex((opt) => {
    const v = Number(opt);
    return Number.isFinite(v) && Math.abs(v - expected) < 1e-9;
  });
  if (matchIdx !== -1) {
    report.push({
      id: item.id, kind,
      before: { c: item.c, text: item.a[item.c] },
      after: { c: matchIdx, text: item.a[matchIdx] },
    });
    item.c = matchIdx;
  } else {
    const newText = fmt(expected);
    report.push({
      id: item.id, kind,
      before: { c: item.c, text: item.a[item.c] },
      after: { c: item.c, text: newText },
    });
    item.a[item.c] = newText;
  }
}

// ---------- fix 1: circumference with π≈3.14 computed with Math.PI ----------
const CIRC_RE = /circumference[^]*?\br\s*=\s*(\d+(?:\.\d+)?)[^]*?π\s*≈\s*3\.14/i;
forEachQuestion((item) => {
  const m = CIRC_RE.exec(item.q);
  if (!m) return;
  const r = Number(m[1]);
  const expected = Number((2 * 3.14 * r).toFixed(2));
  const markedVal = Number(item.a[item.c]);
  if (Number.isFinite(markedVal) && Math.abs(markedVal - expected) < 1e-9) return;
  // Replace the marked-correct option's text with the π=3.14 value (2dp);
  // c keeps pointing at it, per spec.
  const newText = (2 * 3.14 * r).toFixed(2);
  report.push({
    id: item.id, kind: 'circumference-pi',
    before: { c: item.c, text: item.a[item.c] },
    after: { c: item.c, text: newText },
  });
  item.a[item.c] = newText;
});

// ---------- fix 2: round to nearest ten (half up) ----------
const ROUND_RE = /^Round\s+(\d+)\s+to\s+the\s+nearest\s+ten\.?\s*$/i;
forEachQuestion((item) => {
  const m = ROUND_RE.exec(item.q);
  if (!m) return;
  const n = Number(m[1]);
  const expected = Math.round(n / 10) * 10; // Math.round is half-up for positives
  fixExpected(item, 'round-nearest-ten', expected, (v) => String(v));
});

// ---------- fix 3: "What % of X is Y?" (half up) ----------
const PCT_RE = /^What\s+%\s+of\s+(\d+(?:\.\d+)?)\s+is\s+(\d+(?:\.\d+)?)\?\s*$/i;
forEachQuestion((item) => {
  const m = PCT_RE.exec(item.q);
  if (!m) return;
  const x = Number(m[1]);
  const y = Number(m[2]);
  if (x === 0) return;
  const expected = Math.round((100 * y) / x);
  fixExpected(item, 'percent-of', expected, (v) => String(v));
});

// ---------- fix 4: z-score ----------
const Z_RE = /^Z-score:\s*x\s*=\s*(-?\d+(?:\.\d+)?)\s*,\s*μ\s*=\s*(-?\d+(?:\.\d+)?)\s*,\s*σ\s*=\s*(-?\d+(?:\.\d+)?)\s*\?\s*$/i;
forEachQuestion((item) => {
  const m = Z_RE.exec(item.q);
  if (!m) return;
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (c === 0) return;
  const expected = Number(((a - b) / c).toFixed(4));
  fixExpected(item, 'z-score', expected, formatAnswer);
});

// ---------- fix 5: exact duplicate questions within band+topic ----------
for (const band of Object.keys(bank)) {
  for (const topic of Object.keys(bank[band])) {
    const seen = new Map(); // normalized q -> id of first occurrence
    bank[band][topic] = bank[band][topic].filter((item) => {
      const key = normalize(item.q);
      if (seen.has(key)) {
        report.push({
          id: item.id, kind: 'duplicate-question',
          before: { q: item.q }, after: null, keptId: seen.get(key),
        });
        return false;
      }
      seen.set(key, item.id);
      return true;
    });
  }
}

// ---------- fix 6: duplicate option text ----------
// Deterministic distractor generation seeded by fnv1a(id + slot).
function candidateReplacements(baseText) {
  const toks = numericTokens(baseText);
  const out = [];
  const deltas = [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8, -8, 9, -9, 10, -10, 20, -20, 11, -11, 12, 15, 25, 30, 40, 50, 100, -100];
  for (let t = 0; t < toks.length; t++) {
    const tok = toks[t];
    const d = decimalsOf(tok.text);
    const step = d > 0 ? Math.pow(10, -d) : 1;
    const vals = [];
    for (const delta of deltas) {
      vals.push(tok.value + delta);            // whole-unit shifts
      if (d > 0) vals.push(tok.value + delta * step); // last-decimal shifts
    }
    // ±10% and scale errors
    vals.push(tok.value * 1.1, tok.value * 0.9, tok.value * 2, tok.value / 2, tok.value * 10, tok.value / 10);
    // digit swap of integer part
    const intPart = String(Math.trunc(Math.abs(tok.value)));
    if (intPart.length >= 2) {
      const sw = intPart.slice(0, -2) + intPart.slice(-1) + intPart.slice(-2, -1);
      const swapped = Number(sw) * Math.sign(tok.value || 1);
      vals.push(swapped + (Math.abs(tok.value) - Math.trunc(Math.abs(tok.value))) * Math.sign(tok.value || 1));
    }
    // tokens right after ":" are clock minutes: keep 2-digit format, 0-59
    const isMinutes = tok.start > 0 && baseText[tok.start - 1] === ':' && /^\d{2}$/.test(tok.text);
    for (const v of vals) {
      if (!Number.isFinite(v)) continue;
      let formatted = formatLike(v, tok.text);
      if (Number(formatted) === tok.value) continue;
      // avoid negative results for originally non-negative tokens (keeps ages,
      // counts, lengths plausible)
      if (tok.value >= 0 && Number(formatted) < 0) continue;
      if (isMinutes) {
        if (Number(formatted) < 0 || Number(formatted) > 59 || !Number.isInteger(Number(formatted))) continue;
        formatted = formatted.padStart(2, '0');
      }
      out.push(baseText.slice(0, tok.start) + formatted + baseText.slice(tok.end));
    }
  }
  return out;
}

let fallbackPoolHits = 0;
for (const band of Object.keys(bank)) {
  for (const topic of Object.keys(bank[band])) {
    // sibling option pool for non-numeric fallback
    let siblingPool = null;
    const buildPool = () => {
      const pool = [];
      const poolSeen = new Set();
      for (const it of bank[band][topic]) {
        for (const opt of it.a) {
          const k = normalize(opt);
          if (!poolSeen.has(k)) { poolSeen.add(k); pool.push(opt); }
        }
      }
      return pool;
    };
    for (const item of bank[band][topic]) {
      const correctText = item.a[item.c];
      const correctNum = soleNumber(correctText);
      const kept = new Set([normalize(correctText)]);
      let changed = false;
      for (let i = 0; i < 4; i++) {
        if (i === item.c) continue;
        const key = normalize(item.a[i]);
        if (!kept.has(key) && key !== '') { kept.add(key); continue; }
        // regenerate this slot — a candidate must not collide with any kept
        // option NOR any current option text (so we never force a later,
        // still-unique original distractor into regeneration)
        const avoid = new Set([...kept, ...item.a.map(normalize)]);
        const seed = fnv1a(`${item.id}#${i}`);
        const candidates = candidateReplacements(item.a[i] === '' ? correctText : item.a[i]);
        let replacement = null;
        if (candidates.length > 0) {
          // start within the first few (smallest, most plausible) perturbations
          // — the hash only varies the pick, it doesn't jump to wild deltas
          const start = seed % Math.min(candidates.length, 6);
          for (let k = 0; k < candidates.length; k++) {
            const cand = candidates[(start + k) % candidates.length];
            const candKey = normalize(cand);
            if (avoid.has(candKey)) continue;
            const candNum = soleNumber(cand);
            if (correctNum !== null && candNum !== null && Math.abs(candNum - correctNum) < 1e-9) continue;
            replacement = cand;
            break;
          }
        }
        if (replacement === null) {
          // non-numeric or exhausted: borrow a unique option from the topic pool
          if (siblingPool === null) siblingPool = buildPool();
          for (let k = 0; k < siblingPool.length; k++) {
            const cand = siblingPool[(seed + k) % siblingPool.length];
            const candKey = normalize(cand);
            if (avoid.has(candKey)) continue;
            const candNum = soleNumber(cand);
            if (correctNum !== null && candNum !== null && Math.abs(candNum - correctNum) < 1e-9) continue;
            replacement = cand;
            fallbackPoolHits++;
            break;
          }
        }
        if (replacement === null) {
          console.error(`fix-bank: could not regenerate distractor for ${item.id} slot ${i} ("${item.a[i]}")`);
          process.exit(1);
        }
        report.push({
          id: item.id, kind: 'duplicate-option', index: i,
          before: { text: item.a[i] }, after: { text: replacement },
        });
        item.a[i] = replacement;
        kept.add(normalize(replacement));
        changed = true;
      }
      if (changed && new Set(item.a.map(normalize)).size !== 4) {
        console.error(`fix-bank: options still not unique for ${item.id}: ${JSON.stringify(item.a)}`);
        process.exit(1);
      }
    }
  }
}

// ---------- write outputs ----------
writeFileSync(outPath, JSON.stringify(bank, null, 1) + '\n');
writeFileSync(reportPath, JSON.stringify(report, null, 1) + '\n');

const counts = {};
for (const r of report) counts[r.kind] = (counts[r.kind] || 0) + 1;
const dupOptQuestions = new Set(report.filter((r) => r.kind === 'duplicate-option').map((r) => r.id)).size;
let total = 0;
forEachQuestion(() => total++);
console.log(`fix-bank: wrote ${outPath} and ${reportPath}`);
console.log(`fix-bank: changes by kind: ${JSON.stringify(counts)}`);
console.log(`fix-bank: questions with regenerated options: ${dupOptQuestions}`);
console.log(`fix-bank: sibling-pool fallbacks used: ${fallbackPoolHits}`);
console.log(`fix-bank: total questions after fixes: ${total}`);
