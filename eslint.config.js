import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["src/**/*.js", "scripts/**/*.mjs", "tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
        fetch: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        navigator: "readonly",
        process: "readonly",
        URL: "readonly",
        Audio: "readonly",
        CustomEvent: "readonly",
        Blob: "readonly",
        prompt: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
    },
  },
  {
    // Legacy code extracted verbatim from the old index.html monolith.
    // Rewritten module-by-module in the Phase 3 refactor; until then it
    // references globals defined in index.html's inline script.
    files: ["src/firebase-init.js"],
    languageOptions: {
      globals: {
        showToast: "readonly",
        S: "writable",
        PARENT: "writable",
        ONLINE_PLAYERS: "writable",
        LIVE_PLAYERS: "writable",
      },
    },
    rules: {
      "no-empty": "off",
      "no-unused-vars": "off",
      "no-undef": "off",
    },
  },
  {
    ignores: ["dist/", "node_modules/", "question_bank.js", "data/", "functions/node_modules/"],
  },
];
