// bank.test.js — regression fixtures + invariants for the cleaned question bank.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { checkAnswer, gradeBand, getRandomQuestion } from '../../src/data/bank-loader.js';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const normalize = (s) => String(s).trim().replace(/\s+/g, ' ').toLowerCase();

let bank;
let all; // flat [{item, band, topic}]

beforeAll(() => {
  bank = JSON.parse(readFileSync(join(root, 'data', 'question_bank.json'), 'utf8'));
  all = [];
  for (const band of Object.keys(bank)) {
    for (const topic of Object.keys(bank[band])) {
      for (const item of bank[band][topic]) all.push({ item, band, topic });
    }
  }
});

function findByQ(pred) {
  return all.filter(({ item }) => pred(item.q)).map(({ item }) => item);
}

describe('regression fixtures for known-broken questions', () => {
  it('circumference r=5 with π≈3.14 has correct option "31.40"', () => {
    const matches = findByQ((q) => q === 'Circumference: r=5,π≈3.14?');
    expect(matches.length).toBeGreaterThan(0);
    for (const q of matches) expect(q.a[q.c]).toBe('31.40');
  });

  it('"Round 5045 to the nearest ten." correct option is "5050" (half up)', () => {
    const matches = findByQ((q) => q === 'Round 5045 to the nearest ten.');
    expect(matches.length).toBeGreaterThan(0);
    for (const q of matches) expect(q.a[q.c]).toBe('5050');
  });

  it('"What % of 40 is 5?" correct option is "13" (half up)', () => {
    const matches = findByQ((q) => q === 'What % of 40 is 5?');
    expect(matches.length).toBeGreaterThan(0);
    for (const q of matches) expect(q.a[q.c]).toBe('13');
  });

  it('z-score x=60, μ=70, σ=5 correct option is "-2"', () => {
    const matches = findByQ((q) => /^Z-score:\s*x=60,\s*μ=70,\s*σ=5\?$/.test(q));
    expect(matches.length).toBeGreaterThan(0);
    for (const q of matches) expect(q.a[q.c]).toBe('-2');
  });

  it('all circumference r=N π≈3.14 questions use π=3.14, not Math.PI', () => {
    const re = /circumference[^]*?\br\s*=\s*(\d+(?:\.\d+)?)[^]*?π\s*≈\s*3\.14/i;
    const matches = all.filter(({ item }) => re.test(item.q));
    expect(matches.length).toBeGreaterThan(0);
    for (const { item } of matches) {
      const r = Number(re.exec(item.q)[1]);
      expect(Number(item.a[item.c])).toBeCloseTo(2 * 3.14 * r, 9);
    }
  });
});

describe('validator invariants on the generated JSON', () => {
  it('has at least 19,300 questions', () => {
    expect(all.length).toBeGreaterThanOrEqual(19300);
  });

  it('every question has id, q, exactly 4 non-empty options, and c in 0-3', () => {
    for (const { item } of all) {
      expect(typeof item.id).toBe('string');
      expect(item.id.length).toBeGreaterThan(0);
      expect(typeof item.q).toBe('string');
      expect(item.q.trim().length).toBeGreaterThan(0);
      expect(Array.isArray(item.a)).toBe(true);
      expect(item.a).toHaveLength(4);
      for (const opt of item.a) {
        expect(typeof opt).toBe('string');
        expect(opt.trim().length).toBeGreaterThan(0);
      }
      expect(Number.isInteger(item.c)).toBe(true);
      expect(item.c).toBeGreaterThanOrEqual(0);
      expect(item.c).toBeLessThanOrEqual(3);
    }
  });

  it('no question has duplicate options (normalized)', () => {
    const offenders = [];
    for (const { item } of all) {
      if (new Set(item.a.map(normalize)).size !== 4) offenders.push(item.id);
    }
    expect(offenders).toEqual([]);
  });

  it('no duplicate normalized question text within a band+topic', () => {
    const offenders = [];
    for (const band of Object.keys(bank)) {
      for (const topic of Object.keys(bank[band])) {
        const seen = new Set();
        for (const item of bank[band][topic]) {
          const key = normalize(item.q);
          if (seen.has(key)) offenders.push(item.id);
          seen.add(key);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('bank-loader', () => {
  it('checkAnswer compares by value, so duplicate-text options count as correct', () => {
    const synthetic = { id: 't.x.0', q: '2 + 2 = ?', a: ['4', '3', ' 4 ', '5'], c: 0 };
    expect(checkAnswer(synthetic, 0)).toBe(true);
    expect(checkAnswer(synthetic, 2)).toBe(true); // same value, different slot
    expect(checkAnswer(synthetic, 1)).toBe(false);
    expect(checkAnswer(synthetic, 3)).toBe(false);
    expect(checkAnswer(synthetic, -1)).toBe(false);
    expect(checkAnswer(synthetic, 4)).toBe(false);
  });

  it('gradeBand maps grades to bands with grades_6_8 default', () => {
    expect(gradeBand(1)).toBe('grades_1_3');
    expect(gradeBand(3)).toBe('grades_1_3');
    expect(gradeBand(4)).toBe('grades_4_5');
    expect(gradeBand(5)).toBe('grades_4_5');
    expect(gradeBand(6)).toBe('grades_6_8');
    expect(gradeBand(8)).toBe('grades_6_8');
    expect(gradeBand(9)).toBe('grades_9_10');
    expect(gradeBand(10)).toBe('grades_9_10');
    expect(gradeBand(11)).toBe('grades_11_12');
    expect(gradeBand(12)).toBe('grades_11_12');
    expect(gradeBand(0)).toBe('grades_6_8');
    expect(gradeBand(13)).toBe('grades_6_8');
    expect(gradeBand(undefined)).toBe('grades_6_8');
  });

  it('getRandomQuestion respects usedIds and returns null when exhausted', () => {
    const mini = {
      grades_1_3: { Addition: [
        { id: 'grades_1_3.Addition.0', q: '1+1=?', a: ['2', '3', '4', '5'], c: 0 },
        { id: 'grades_1_3.Addition.1', q: '1+2=?', a: ['3', '2', '4', '5'], c: 0 },
      ] },
    };
    const used = new Set(['grades_1_3.Addition.0']);
    const q = getRandomQuestion(mini, 'grades_1_3', used);
    expect(q.id).toBe('grades_1_3.Addition.1');
    used.add(q.id);
    expect(getRandomQuestion(mini, 'grades_1_3', used)).toBeNull();
    expect(getRandomQuestion(mini, 'no_such_band', new Set())).toBeNull();
    // real bank: returns a valid question
    const real = getRandomQuestion(bank, 'grades_6_8', new Set());
    expect(real).toBeTruthy();
    expect(real.a).toHaveLength(4);
  });
});
