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
    // Threads pool: the forks pool intermittently hit the Windows
    // child-process teardown flake (tinypool "Channel closed" /
    // ERR_IPC_CHANNEL_CLOSED) that made a full run hang after all tests had
    // passed — the root cause of audit F-04's non-terminating suite. Threads
    // avoids child-process IPC entirely and completes the full suite
    // reliably. Files still run sequentially and isolated.
    pool: "threads",
    poolOptions: {
      threads: {
        isolate: true
      }
    },
    // Bounded per-test/hook timeouts so a genuine hang fails fast instead of
    // blocking the whole suite forever (audit F-04).
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
});
