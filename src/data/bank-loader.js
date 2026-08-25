// bank-loader.js — app-facing access to the cleaned question bank JSON.
// The JSON is produced by scripts/convert-bank.mjs + scripts/fix-bank.mjs.

let cachedBank = null;

/**
 * Load the question bank JSON (cached after first load).
 * Vite supports dynamic JSON imports; the parsed object is the default export.
 * @returns {Promise<object>} {band: {topic: [{id, q, a, c}]}}
 */
export async function loadBank() {
  if (cachedBank !== null) return cachedBank;
  const mod = await import('../../data/question_bank.json');
  cachedBank = mod.default ?? mod;
  return cachedBank;
}

/**
 * Map a numeric grade (1-12) to its band key. Defaults to grades_6_8.
 * @param {number} gradeNum
 * @returns {string}
 */
export function gradeBand(gradeNum) {
  const g = Number(gradeNum);
  if (g >= 1 && g <= 3) return 'grades_1_3';
  if (g >= 4 && g <= 5) return 'grades_4_5';
  if (g >= 6 && g <= 8) return 'grades_6_8';
  if (g >= 9 && g <= 10) return 'grades_9_10';
  if (g >= 11 && g <= 12) return 'grades_11_12';
  return 'grades_6_8';
}

/**
 * Pick a random question from a grade band, excluding already-used ids.
 * @param {object} bank - object returned by loadBank()
 * @param {string} band - band key, e.g. 'grades_6_8'
 * @param {Set<string>|string[]} [usedIds] - question ids to exclude
 * @returns {object|null} a question {id, q, a, c}, or null if none available
 */
export function getRandomQuestion(bank, band, usedIds) {
  const topics = bank && bank[band];
  if (!topics) return null;
  const used = usedIds instanceof Set ? usedIds : new Set(usedIds || []);
  const available = [];
  for (const topic of Object.keys(topics)) {
    for (const q of topics[topic]) {
      if (!used.has(q.id)) available.push(q);
    }
  }
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

const normalize = (s) => String(s).trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Check an answer BY VALUE: the selected option is correct iff its normalized
 * text equals the normalized text of the marked-correct option. This way a
 * duplicate-text option can never mark a right-looking answer wrong.
 * @param {object} question - {q, a, c}
 * @param {number} selectedIndex - 0-3
 * @returns {boolean}
 */
export function checkAnswer(question, selectedIndex) {
  if (!question || !Array.isArray(question.a)) return false;
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= question.a.length) return false;
  return normalize(question.a[selectedIndex]) === normalize(question.a[question.c]);
}
