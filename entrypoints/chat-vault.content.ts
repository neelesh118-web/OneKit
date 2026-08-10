import { detectChatSite } from "../src/core/chat-capture";
import { createChatVaultCapture } from "../src/core/chat-vault-content";
import { localStorageVault } from "../src/core/chat-vault";
import { readVaultCrypto, localStorageVaultCrypto } from "../src/core/vault-crypto";
import { loadSettings } from "../src/core/settings";
import { browser } from "wxt/browser";

/**
 * AI Chat Vault — runs only on the supported AI chat sites, captures
 * conversations locally, and only when the user has turned the vault on
 * (Settings → Tools). Off by default; nothing is captured until then.
 */
export default defineContentScript({
  matches: [
    "https://chatgpt.com/*",
    "https://claude.ai/*",
    "https://gemini.google.com/*"
  ],
  main() {
    const config = detectChatSite(window.location.hostname);
    if (!config) return;

    const capture = createChatVaultCapture({
      config,
      storage: localStorageVault()
    });

    const maybeStart = async (): Promise<void> => {
      try {
        const settings = await loadSettings();
        // While the vault is encrypted, capture pauses: the content script
        // has no passphrase and must never write plaintext conversations.
        const encrypted = await readVaultCrypto(localStorageVaultCrypto());
        if (settings.tools.chatVault && !encrypted) capture.start();
        else capture.stop();
      } catch {
        // Settings unavailable — stay off (safe default).
      }
    };

    void maybeStart();
    try {
      browser.storage.onChanged.addListener((changes, areaName) => {
        if (
          areaName === "local" &&
          (changes["ok.settings"] || changes["ok.vaultCrypto"])
        ) {
          void maybeStart();
        }
      });
    } catch {
      // Storage events unavailable — the initial read still applies.
    }
  }
});
