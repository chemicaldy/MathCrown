// Builds the trimmed grading map the Cloud Functions bundle ships with:
// { "<question id>": <correct index> } — ~700KB instead of the full 8MB bank,
// so recordSession can re-grade sessions without a cold-start parse of the
// whole question bank.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bank = JSON.parse(readFileSync(resolve(root, "data/question_bank.json"), "utf8"));

const map = {};
let count = 0;
for (const band of Object.values(bank)) {
  for (const questions of Object.values(band)) {
    for (const q of questions) {
      if (typeof q.id !== "string" || !Number.isInteger(q.c)) {
        throw new Error(`malformed entry: ${JSON.stringify(q).slice(0, 120)}`);
      }
      if (map[q.id] !== undefined) throw new Error(`duplicate id: ${q.id}`);
      map[q.id] = q.c;
      count++;
    }
  }
}

const out = resolve(root, "functions/data/answer-map.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(map));
console.log(`build-answer-map: wrote ${out} (${count} entries)`);
