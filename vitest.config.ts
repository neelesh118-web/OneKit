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
    }
  }
});
