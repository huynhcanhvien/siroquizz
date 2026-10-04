import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "messages/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "src/lib/**/*.ts",
        "src/features/**/lib/**/*.ts",
        "src/features/**/repository.ts",
        "src/features/**/http-repository.ts",
        "src/features/**/schemas.ts",
        "src/server/env-schema.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "src/lib/types.ts",
        "src/features/**/lib/types.ts",
        "src/lib/use-messages.ts",
      ],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
});
