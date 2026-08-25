import { defineConfig } from "vitest/config";

// Dedicated config for the Firestore security-rules suite. The main
// vite.config.js only includes tests/unit and tests/functions; this one is
// passed explicitly via `vitest run -c tests/rules/vitest.config.js` by the
// `test:rules` npm script, which wraps it in `firebase emulators:exec`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/rules/**/*.test.js"],
    // The emulator round-trips (and the first-ever jar download) are slow.
    testTimeout: 30000,
    hookTimeout: 60000,
    // One emulator, one project — keep files sequential to avoid
    // clearFirestore() stomping on a parallel file.
    fileParallelism: false,
  },
});
