import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["e2e/**", "node_modules/**"],
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "https://example.com/"
      }
    },
    // Run files sequentially to avoid shared-jsdom pollution between files.
    fileParallelism: false,
    pool: "forks",
    poolOptions: {
      forks: {
        isolate: true
      }
    },
    // Bounded per-test/hook timeouts so a genuine hang fails fast instead of
    // blocking the whole suite forever (audit F-04).
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
});
