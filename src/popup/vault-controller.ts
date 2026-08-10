import {
  clearVault,
  deleteConversation,
  exportConversationMarkdown,
  listConversations,
  searchConversations,
  upsertConversation,
  vaultStats,
  type ChatConversation
} from "../core/chat-vault";
import {
  decryptVaultJson,
  encryptVaultJson,
  readVaultCrypto,
  writeVaultCrypto
} from "../core/vault-crypto";
import {
  addNote,
  clearNotes,
  emptyNotesVault,
  loadNotesVault,
  lockNotes,
  notesAreEncrypted,
  readNotesStorage,
  removeNote,
  removeNotesEncryption,
  saveNotesPlain,
  unlockNotes,
  updateNote,
  type SecureNotesVault
} from "../core/secure-notes";
import type { OneKitCapabilities } from "./capabilities";

/**
 * Vault tab — the AI Chat Vault: search, open, export, delete, and
 * optional password encryption. While encrypted, the plaintext vault is
 * removed from storage; the popup decrypts it into memory after the user
 * enters the password, and any change re-encrypts. No recovery: a lost
 * password means a lost vault (stated honestly in the UI).
 */
export function createVaultController(caps: OneKitCapabilities): () => void {
  const $ = (id: string): HTMLElement => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  };

  const search = $("vault-search") as HTMLInputElement;
  const results = $("vault-results");
  const status = $("vault-status");
  const count = $("vault-count");
  const refreshBtn = $("vault-refresh") as HTMLButtonElement;
  const clearBtn = $("vault-clear") as HTMLButtonElement;
  const controls = $("vault-controls");

  const cryptoState = $("vault-crypto-state");
  const cryptoStatus = $("vault-crypto-status");
  const encryptForm = $("vault-encrypt-form");
  const encryptPassword = $("vault-encrypt-password") as HTMLInputElement;
  const encryptPassword2 = $("vault-encrypt-password2") as HTMLInputElement;
  const encryptBtn = $("vault-encrypt-btn") as HTMLButtonElement;
  const unlockForm = $("vault-unlock-form");
  const unlockPassword = $("vault-unlock-password") as HTMLInputElement;
  const unlockBtn = $("vault-unlock-btn") as HTMLButtonElement;
  const decryptBtn = $("vault-decrypt-btn") as HTMLButtonElement;

  /** While unlocked, the decrypted conversations live here. */
  let memoryConversations: ChatConversation[] | null = null;
  /** Popup-session copy of the password, used only to re-encrypt. */
  let sessionPassword: string | null = null;

  const SITE_LABELS: Record<string, string> = {
    chatgpt: "ChatGPT",
    claude: "Claude",
    gemini: "Gemini"
  };

  async function isEncrypted(): Promise<boolean> {
    return (await readVaultCrypto(caps.storage)) !== null;
  }

  async function persistEncrypted(): Promise<void> {
    if (!sessionPassword) throw new Error("Vault password missing from this session.");
    const blob = await encryptVaultJson(JSON.stringify(memoryConversations ?? []), sessionPassword);
    await writeVaultCrypto(caps.storage, blob);
  }

  function sourceConversations(): ChatConversation[] {
    return memoryConversations ?? [];
  }

  async function render(): Promise<void> {
    const q = search.value.trim();
    let conversations: ChatConversation[];
    if (memoryConversations !== null) {
      const needle = q.toLowerCase();
      conversations = needle
        ? memoryConversations.filter(
            (c) =>
              c.title.toLowerCase().includes(needle) ||
              c.messages.some((m) => m.text.toLowerCase().includes(needle))
          )
        : memoryConversations;
      conversations = [...conversations].sort((a, b) => b.updated - a.updated);
    } else {
      conversations = q ? await searchConversations(caps.storage, q) : await listConversations(caps.storage);
    }

    results.innerHTML = "";
    if (conversations.length === 0) {
      status.textContent = q.trim()
        ? "No chats match."
        : "No chats saved yet. Turn on 'Save AI chat conversations locally' in Settings, then use ChatGPT / Claude / Gemini.";
      return;
    }
    status.textContent = `${conversations.length} conversation${conversations.length === 1 ? "" : "s"}.`;
    for (const conversation of conversations) {
      const row = document.createElement("div");
      row.className = "result-row";

      const title = document.createElement("strong");
      title.className = "result-title";
      title.textContent = conversation.title;

      const meta = document.createElement("span");
      meta.className = "result-meta";
      const lastMessage = conversation.messages[conversation.messages.length - 1];
      meta.textContent = `${SITE_LABELS[conversation.siteId] ?? conversation.siteId} · ${conversation.messages.length} messages · ${new Date(conversation.updated).toLocaleString()}${lastMessage ? ` · ${lastMessage.text.slice(0, 60)}` : ""}`;

      const actions = document.createElement("div");
      actions.className = "btn-row";

      const open = document.createElement("button");
      open.type = "button";
      open.className = "mini-btn";
      open.textContent = "Open";
      open.addEventListener("click", () => {
        void caps.openUrl(conversation.url);
        window.close();
      });

      const exportBtn = document.createElement("button");
      exportBtn.type = "button";
      exportBtn.className = "mini-btn";
      exportBtn.textContent = "Export .md";
      exportBtn.addEventListener("click", () => {
        const md = exportConversationMarkdown(conversation);
        const filename = `${conversation.title.slice(0, 50).replace(/[\\/:*?"<>|]/g, "")}.md`;
        caps.downloadText(md, filename);
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "mini-btn danger";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => {
        void (async () => {
          if (memoryConversations !== null) {
            memoryConversations = memoryConversations!.filter((c) => c.id !== conversation.id);
            await persistEncrypted();
          } else {
            await deleteConversation(caps.storage, conversation.id);
          }
          await Promise.all([render(), refreshCount()]);
        })();
      });

      actions.append(open, exportBtn, deleteBtn);
      row.append(title, meta, actions);
      results.appendChild(row);
    }
  }

  async function refreshCount(): Promise<void> {
    if (memoryConversations !== null) {
      const messages = memoryConversations.reduce((n, c) => n + c.messages.length, 0);
      count.textContent = `${memoryConversations.length} chats · ${messages} msgs`;
      return;
    }
    const stats = await vaultStats(caps.storage);
    count.textContent = `${stats.conversations} chats · ${stats.messages} msgs`;
  }

  async function refreshAll(): Promise<void> {
    await Promise.all([render(), refreshCount()]);
  }

  /* Encryption UI ------------------------------------------------------- */
  function setEncryptFormVisible(visible: boolean): void {
    encryptForm.hidden = !visible;
  }

  function setUnlockFormVisible(visible: boolean): void {
    unlockForm.hidden = !visible;
  }

  async function renderCryptoState(): Promise<void> {
    const encrypted = await isEncrypted();
    const unlocked = memoryConversations !== null;
    if (!encrypted) {
      cryptoState.textContent = "Not encrypted — your vault is stored locally without a password.";
      setEncryptFormVisible(true);
      setUnlockFormVisible(false);
      controls.hidden = false;
      return;
    }
    if (unlocked) {
      cryptoState.textContent =
        "Encrypted — unlocked for this session. Chat capture stays paused while encrypted. Use 'Remove encryption' below to go back to plain storage.";
      setEncryptFormVisible(false);
      setUnlockFormVisible(true);
      unlockPassword.hidden = true;
      unlockBtn.hidden = true;
      decryptBtn.hidden = false;
      controls.hidden = false;
      return;
    }
    cryptoState.textContent = "Encrypted — locked. Enter your password to view your chats.";
    setEncryptFormVisible(false);
    setUnlockFormVisible(true);
    unlockPassword.hidden = false;
    unlockBtn.hidden = false;
    decryptBtn.hidden = true;
    controls.hidden = true;
  }

  encryptBtn.addEventListener("click", () => {
    void (async () => {
      const password = encryptPassword.value;
      if (password.length < 6) {
        cryptoStatus.textContent = "Password must be at least 6 characters.";
        return;
      }
      if (password !== encryptPassword2.value) {
        cryptoStatus.textContent = "The two passwords don't match.";
        return;
      }
      const conversations = await listConversations(caps.storage);
      const blob = await encryptVaultJson(JSON.stringify(conversations), password);
      await writeVaultCrypto(caps.storage, blob);
      await clearVault(caps.storage);
      sessionPassword = password;
      memoryConversations = conversations;
      encryptPassword.value = "";
      encryptPassword2.value = "";
      cryptoStatus.textContent = "Vault encrypted. From now on it needs your password to open.";
      await renderCryptoState();
      await refreshAll();
    })().catch(() => {
      cryptoStatus.textContent = "Could not encrypt the vault.";
    });
  });

  unlockBtn.addEventListener("click", () => {
    void (async () => {
      const password = unlockPassword.value;
      const blob = await readVaultCrypto(caps.storage);
      if (!blob) {
        cryptoStatus.textContent = "The vault isn't encrypted anymore.";
        await renderCryptoState();
        return;
      }
      try {
        const json = await decryptVaultJson(blob, password);
        const conversations = JSON.parse(json) as ChatConversation[];
        if (!Array.isArray(conversations)) throw new Error("Bad vault contents");
        memoryConversations = conversations.filter((c) => c && typeof c === "object");
        sessionPassword = password;
        unlockPassword.value = "";
        cryptoStatus.textContent = "Unlocked. Changes are re-encrypted automatically.";
      } catch {
        cryptoStatus.textContent = "Wrong password — could not unlock the vault.";
        return;
      }
      await renderCryptoState();
      await refreshAll();
    })().catch(() => {
      cryptoStatus.textContent = "Could not unlock the vault.";
    });
  });

  decryptBtn.addEventListener("click", () => {
    void (async () => {
      if (memoryConversations === null) return;
      await clearVault(caps.storage);
      await writeVaultCrypto(caps.storage, null);
      // Write the plaintext back so the vault works without a password again.
      for (const conversation of memoryConversations) {
        await upsertConversation(caps.storage, conversation);
      }
      sessionPassword = null;
      memoryConversations = null;
      cryptoStatus.textContent = "Encryption removed — the vault is stored plainly again.";
      await renderCryptoState();
      await refreshAll();
    })().catch(() => {
      cryptoStatus.textContent = "Could not remove encryption.";
    });
  });

  let debounce: number | undefined;
  search.addEventListener("input", () => {
    if (debounce !== undefined) window.clearTimeout(debounce);
    debounce = window.setTimeout(() => void render(), 200);
  });
  refreshBtn.addEventListener("click", () => void refreshAll());
  clearBtn.addEventListener("click", () => {
    void (async () => {
      if (memoryConversations !== null) {
        memoryConversations = [];
        await persistEncrypted();
      } else {
        await clearVault(caps.storage);
      }
      await refreshAll();
    })();
  });

  void refreshAll();
  void renderCryptoState();
  wireSecureNotes();
  return () => {};

  /* Secure notes ------------------------------------------------------ */
  let snVault: SecureNotesVault | null = null; // null while encrypted/locked
  let snPassphrase: string | null = null; // held in memory only while unlocked

  function wireSecureNotes(): void {
    const snState = $("sn-state");
    const snStatus = $("sn-status");
    const snPass = $("sn-pass") as HTMLInputElement;
    const snUnlock = $("sn-unlock") as HTMLButtonElement;
    const snSet = $("sn-set") as HTMLButtonElement;
    const snLock = $("sn-lock") as HTMLButtonElement;
    const snRemoveEnc = $("sn-remove-enc") as HTMLButtonElement;
    const snTitle = $("sn-title") as HTMLInputElement;
    const snBody = $("sn-body") as HTMLTextAreaElement;
    const snAdd = $("sn-add") as HTMLButtonElement;
    const snList = $("sn-list");
    const snClear = $("sn-clear") as HTMLButtonElement;
    const snAddWrap = $("sn-add-wrap");
    const snListWrap = $("sn-list-wrap");

    async function renderNotesList(): Promise<void> {
      const vault = snPassphrase ? snVault : ((await loadNotesVault(caps.storage)) ?? emptyNotesVault());
      if (!vault) {
        snList.textContent = "";
        return;
      }
      snList.textContent = "";
      if (vault.notes.length === 0) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = "No notes yet.";
        snList.appendChild(empty);
        return;
      }
      for (const note of vault.notes) {
        const row = document.createElement("details");
        row.className = "note-row";
        const summary = document.createElement("summary");
        summary.textContent = note.title;
        const body = document.createElement("div");
        body.className = "note-body";
        const ta = document.createElement("textarea");
        ta.value = note.body;
        ta.rows = 3;
        ta.placeholder = "Note body…";
        ta.addEventListener("change", () => {
          void (async () => {
            if (snPassphrase && snVault) {
              snVault = updateNote(snVault, note.id, { body: ta.value }, caps.now());
              await lockNotes(caps.storage, snPassphrase, snVault);
            } else {
              await saveNotesPlain(caps.storage, updateNote(vault, note.id, { body: ta.value }, caps.now()));
            }
            snStatus.textContent = "Saved.";
          })();
        });
        const del = document.createElement("button");
        del.type = "button";
        del.className = "link-btn";
        del.textContent = "✕";
        del.title = "Delete note";
        del.addEventListener("click", () => {
          void (async () => {
            if (snPassphrase && snVault) {
              snVault = removeNote(snVault, note.id);
              await lockNotes(caps.storage, snPassphrase, snVault);
            } else {
              await saveNotesPlain(caps.storage, removeNote(vault, note.id));
            }
            await renderNotesList();
          })();
        });
        body.append(ta, del);
        row.append(summary, body);
        snList.appendChild(row);
      }
    }

    async function renderNotes(): Promise<void> {
      const stored = await readNotesStorage(caps.storage);
      const encrypted = notesAreEncrypted(stored);
      const unlocked = snPassphrase !== null;
      const hasPlain = !encrypted && stored !== undefined && stored !== null;

      snPass.hidden = false;
      if (encrypted && !unlocked) {
        snState.textContent = "🔒 Locked — notes are encrypted at rest.";
        snUnlock.hidden = false;
        snSet.hidden = true;
        snLock.hidden = true;
        snRemoveEnc.hidden = true;
        snAddWrap.hidden = true;
        snListWrap.hidden = true;
        snClear.hidden = true;
        snPass.placeholder = "Passphrase";
      } else if (unlocked) {
        snState.textContent = "🔓 Unlocked — passphrase held in memory only.";
        snUnlock.hidden = true;
        snSet.hidden = true;
        snLock.hidden = false;
        snRemoveEnc.hidden = false;
        snAddWrap.hidden = false;
        snListWrap.hidden = false;
        snClear.hidden = false;
        snPass.hidden = true;
      } else {
        snState.textContent = hasPlain
          ? "Notes are stored unencrypted — set a passphrase to encrypt them."
          : "No notes yet — they're stored unencrypted until you set a passphrase.";
        snUnlock.hidden = true;
        snSet.hidden = false;
        snLock.hidden = true;
        snRemoveEnc.hidden = true;
        snAddWrap.hidden = false;
        snListWrap.hidden = false;
        snClear.hidden = false;
      }
      await renderNotesList();
    }

    snAdd.addEventListener("click", () => {
      void (async () => {
        const title = snTitle.value;
        const body = snBody.value;
        if (!title.trim() && !body.trim()) {
          snStatus.textContent = "Add a title or some text first.";
          return;
        }
        if (snPassphrase && snVault) {
          snVault = addNote(snVault, title, body, caps.now());
          await lockNotes(caps.storage, snPassphrase, snVault);
        } else {
          const vault = (await loadNotesVault(caps.storage)) ?? emptyNotesVault();
          await saveNotesPlain(caps.storage, addNote(vault, title, body, caps.now()));
        }
        snTitle.value = "";
        snBody.value = "";
        snStatus.textContent = "Note saved.";
        await renderNotesList();
      })();
    });

    snSet.addEventListener("click", () => {
      void (async () => {
        const pass = snPass.value;
        if (pass.length < 4) {
          snStatus.textContent = "Passphrase needs at least 4 characters.";
          return;
        }
        const vault = (await loadNotesVault(caps.storage)) ?? emptyNotesVault();
        await lockNotes(caps.storage, pass, vault);
        snPassphrase = pass;
        snVault = vault;
        snPass.value = "";
        snStatus.textContent = "Notes encrypted with your passphrase.";
        await renderNotes();
      })();
    });

    snUnlock.addEventListener("click", () => {
      void (async () => {
        try {
          const vault = await unlockNotes(caps.storage, snPass.value);
          snPassphrase = snPass.value;
          snVault = vault;
          snPass.value = "";
          snStatus.textContent = "Unlocked.";
          await renderNotes();
        } catch {
          snStatus.textContent = "Wrong passphrase — notes stay locked.";
        }
      })();
    });

    snLock.addEventListener("click", () => {
      void (async () => {
        if (!snPassphrase || !snVault) return;
        await lockNotes(caps.storage, snPassphrase, snVault);
        snPassphrase = null;
        snVault = null;
        snStatus.textContent = "Locked — passphrase cleared from memory.";
        await renderNotes();
      })();
    });

    snRemoveEnc.addEventListener("click", () => {
      void (async () => {
        if (!snPassphrase || !snVault) return;
        if (!window.confirm("Remove encryption and store your notes as plain text?")) return;
        await removeNotesEncryption(caps.storage, snVault);
        snPassphrase = null;
        snVault = null;
        snStatus.textContent = "Encryption removed — notes are now plaintext.";
        await renderNotes();
      })();
    });

    snClear.addEventListener("click", () => {
      void (async () => {
        const count = snPassphrase ? snVault?.notes.length ?? 0 : ((await loadNotesVault(caps.storage))?.notes.length ?? 0);
        if (!window.confirm(`Delete all ${count} note${count === 1 ? "" : "s"}? This cannot be undone.`)) return;
        await clearNotes(caps.storage);
        snVault = emptyNotesVault();
        snPassphrase = null;
        snStatus.textContent = "All notes deleted.";
        await renderNotes();
      })();
    });

    void renderNotes();
  }
}
