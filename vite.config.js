import { defineConfig } from "vite";
import { copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// question_bank.js stays at the repo root untouched (legacy jsDelivr consumers
// pin @main/question_bank.js), so copy it into dist at build time until the
// JSON bank pipeline replaces it as the app's source of truth.
function copyQuestionBank() {
  return {
    name: "copy-question-bank",
    writeBundle(options) {
      copyFileSync(
        resolve(__dirname, "question_bank.js"),
        resolve(options.dir ?? "dist", "question_bank.js")
      );
    },
  };
}

export default defineConfig({
  plugins: [copyQuestionBank()],
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  test: {
    environment: "node",
    // tests/functions and tests/rules need live emulators — they run via
    // `npm run test:functions` / `npm run test:rules`, not plain `npm test`.
    include: ["tests/unit/**/*.test.js"],
    passWithNoTests: true,
  },
});
