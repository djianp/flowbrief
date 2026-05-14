import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Layer 1 of the two-layer test strategy: hermetic, offline, fast.
// `npm test` runs this. The OpenAI-hitting eval harness is a separate
// `npm run eval` script and is intentionally NOT matched by `include`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    globals: false,
    // Load .env.test before each test file's module graph evaluates, so
    // @/lib/prisma's singleton is constructed against the test database.
    setupFiles: ["tests/setup/env.ts"],
    // One-time: create the schema in the test database before the suite.
    globalSetup: ["tests/setup/global-setup.ts"],
    // The integration tests share a single SQLite file. Running test files
    // sequentially keeps resetDb() in one file from wiping another's data.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      // Mirror the tsconfig.json path alias "@/*": ["./src/*"] so tests can
      // import application code exactly the way the app does.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
