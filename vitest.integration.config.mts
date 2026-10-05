import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    coverage: {
      provider: "v8",
      include: [
        "src/server/services/**/*.ts",
        "src/server/ai/jobs.ts",
        "src/server/ai/generate.ts",
        "src/server/ai/auxiliary.ts",
        "src/server/ai/extract.ts",
        "src/server/ai/storage.ts",
        "src/server/ai/groq.ts",
        "src/server/api.ts",
        "src/server/api-error.ts",
        "src/app/api/v1/[[]...path]/route.ts",
      ],
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage/integration",
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 70 },
    },
  },
});
