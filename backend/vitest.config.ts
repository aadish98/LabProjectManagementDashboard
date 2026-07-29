import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    passWithNoTests: false,
    restoreMocks: true,
    clearMocks: true
  }
});
