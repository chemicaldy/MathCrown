import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/functions/**/*.test.js"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
