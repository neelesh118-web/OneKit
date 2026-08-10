import {
  addVaultEntry,
  changeMasterPassword,
  clearMasterPassword,
  clearVaultEntries,
  exportVaultBackup,
  hasMasterPassword,
  importVaultBackup,
  normalizeSite,
  parseVaultBackupFile,
  readVaultEntries,
  removeVaultEntry,
  serializeVaultBackup,
  setMasterPassword,
  siteMatches,
  unlockVault,
  validateVaultEntry,
  vaultBackupEntryToInput,
  vaultBackupFilename,
  type PasswordEntry
} from "../core/passwords";
import { DEFAULT_PASSWORD_OPTIONS, generatePassword } from "../core/password-gen";
import type { OneKitCapabilities } from "./capabilities";

/**
 * Password vault — Safety tab. Whole-blob AES-GCM at rest (vault-crypto),
 * master password held in memory for the session, popup-only one-click fill
 * (never auto-fill, never auto-submit). Fill sends the credentials to the
 * active tab's content script, which fills the first username + last
 * password field and toasts "check the fields before submitting".
 */
export function createPasswordVaultController(caps: OneKitCapabilities): () => void {
  const $ = (id: string): HTMLElement => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  };

  const status = $("pwv-status");
  const passphraseInput = $("pwv-passphrase-input") as HTMLInputElement;
  const passphraseSet = $("pwv-passphrase-set") as HTMLButtonElement;
  const passphraseClear = $("pwv-passphrase-clear") as HTMLButtonElement;
  const unlockWrap = $("pwv-unlock-wrap");
  const unlockInput = $("pwv-unlock-input") as HTMLInputElement;
  const unlockBtn = $("pwv-unlock-btn") as HTMLButtonElement;
  const changeInput = $("pwv-change-input") as HTMLInputElement;
  const changeBtn = $("pwv-change-btn") as HTMLButtonElement;
  const siteInput = $("pwv-site") as HTMLInputElement;
  const usernameInput = $("pwv-username") as HTMLInputElement;
  const passwordInput = $("pwv-password") as HTMLInputElement;
  const notesInput = $("pwv-notes") as HTMLInputElement;
  const generateBtn = $("pwv-generate") as HTMLButtonElement;
  const addBtn = $("pwv-add") as HTMLButtonElement;
  const listEl = $("pwv-list");
  const exportBtn = $("pwv-export") as HTMLButtonElement;
  const importBtn = $("pwv-import") as HTMLButtonElement;
  const importFile = $("pwv-import-file") as HTMLInputElement;
  const deleteAll = $("pwv-delete-all") as HTMLButtonElement;

  let vaultKey: CryptoKey | null = null;
  let entries: PasswordEntry[] = [];
  let currentHost = "";

  async function refreshCurrentHost(): Promise<void> {
    const tab = await caps.getActiveTab();
    const url = tab.url ?? "";
    if (url.startsWith("http")) {
      try {
        currentHost = new URL(url).hostname;
      } catch {
        currentHost = "";
      }
    } else {
      currentHost = "";
    }
  }

  async function refreshLockUi(): Promise<void> {
    const hasMaster = await hasMasterPassword(caps.storage);
    const locked = hasMaster && vaultKey === null;
    unlockWrap.hidden = !locked;
    passphraseInput.hidden = locked;
    passphraseSet.hidden = locked;
    changeInput.hidden = !hasMaster || locked;
    changeBtn.hidden = !hasMaster || locked;
    passphraseClear.hidden = !hasMaster;
    if (locked) {
      status.textContent =
        "The vault is encrypted. Enter your master password — the key stays in memory for this session only.";
    }
  }

  async function renderList(): Promise<void> {
    listEl.innerHTML = "";
    const plaintextWarning = !(await hasMasterPassword(caps.storage))
      ? "No master password set — logins are stored in plaintext on this device. Set one to encrypt the vault. "
      : "";
    if (entries.length === 0) {
      listEl.textContent =
        "No saved logins yet. Add one below — or open the page you want to log into and fill from here.";
      status.textContent = plaintextWarning || "";
      return;
    }
    const hostLine = plaintextWarning + (currentHost
      ? entries.some((e) => siteMatches(e.site, currentHost, true))
        ? `Filling works on ${currentHost} — entries that match it are marked ✓.`
        : `No saved entry matches ${currentHost} — you can still fill any entry, but check the site first.`
      : "Fill sends the credentials to the active tab — check the site before submitting.");
    status.textContent = hostLine;
    for (const entry of entries) {
      const row = document.createElement("div");
      row.className = "result-row vault-row";
      const head = document.createElement("div");
      const title = document.createElement("strong");
      title.className = "result-title";
      const matches = siteMatches(entry.site, currentHost, true);
      title.textContent = `${entry.site}${matches ? " ✓" : ""}`;
      const meta = document.createElement("span");
      meta.className = "result-meta";
      meta.textContent = `${entry.username}${entry.notes ? " · " + entry.notes : ""} · password hidden`;
      head.append(title, meta);
      const fill = document.createElement("button");
      fill.type = "button";
      fill.className = "mini-btn primary";
      fill.textContent = "Fill this page";
      fill.addEventListener("click", () => {
        void (async () => {
          const tab = await caps.getActiveTab();
          if (tab.id === undefined) {
            status.textContent = "Open the login page first, then fill.";
            return;
          }
          const result = (await caps.sendMessage(tab.id, {
            type: "ok:vault-fill",
            username: entry.username,
            password: entry.password,
            site: entry.site
          })) as { filled?: number } | undefined;
          const filled = result?.filled ?? 0;
          status.textContent =
            filled > 0
              ? `Filled ${entry.site} — check the fields on the page before submitting.`
              : "No login fields found on that page.";
        })().catch(() => {
          status.textContent = "Could not reach that page — reload it and try again.";
        });
      });
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "mini-btn";
      copy.textContent = "Copy password";
      copy.addEventListener("click", () => {
        void caps.copyText(entry.password).then(() => {
          status.textContent = `Password for ${entry.site} copied ✓`;
        });
      });
      const del = document.createElement("button");
      del.type = "button";
      del.className = "mini-btn danger";
      del.textContent = "Delete";
      del.addEventListener("click", () => {
        void (async () => {
          await removeVaultEntry(entry.id, caps.storage, vaultKey);
          entries = await readVaultEntries(caps.storage, vaultKey);
          await renderList();
        })().catch((err) => {
          status.textContent = err instanceof Error ? err.message : "Could not delete.";
        });
      });
      row.append(head, fill, copy, del);
      listEl.appendChild(row);
    }
  }

  async function loadVault(): Promise<void> {
    try {
      entries = await readVaultEntries(caps.storage, vaultKey);
    } catch {
      entries = [];
      vaultKey = null;
      await refreshLockUi();
      return;
    }
    await renderList();
  }

  passphraseSet.addEventListener("click", () => {
    void (async () => {
      try {
        vaultKey = await setMasterPassword(passphraseInput.value, caps.storage);
        passphraseInput.value = "";
        status.textContent = "Master password set — the vault is now encrypted at rest.";
        await refreshLockUi();
        await loadVault();
      } catch (err) {
        status.textContent = err instanceof Error ? err.message : "Could not set master password.";
      }
    })();
  });

  passphraseClear.addEventListener("click", () => {
    void (async () => {
      if (!window.confirm("Remove the master password? The vault will be stored in plaintext on this device.")) return;
      if (!vaultKey) {
        status.textContent = "Unlock the vault first.";
        return;
      }
      await clearMasterPassword(caps.storage, vaultKey);
      vaultKey = null;
      status.textContent = "Master password removed — the vault is plaintext again. Set one to re-encrypt.";
      await refreshLockUi();
      await loadVault();
    })().catch((err) => {
      status.textContent = err instanceof Error ? err.message : "Could not remove master password.";
    });
  });

  unlockBtn.addEventListener("click", () => {
    void (async () => {
      try {
        vaultKey = await unlockVault(unlockInput.value, caps.storage);
        unlockInput.value = "";
        await refreshLockUi();
        await loadVault();
      } catch (err) {
        status.textContent = err instanceof Error ? err.message : "Wrong master password.";
      }
    })();
  });

  changeBtn.addEventListener("click", () => {
    void (async () => {
      if (!vaultKey) {
        status.textContent = "Unlock the vault first.";
        return;
      }
      try {
        vaultKey = await changeMasterPassword(vaultKey, changeInput.value, caps.storage);
        changeInput.value = "";
        status.textContent = "Master password changed.";
      } catch (err) {
        status.textContent = err instanceof Error ? err.message : "Could not change master password.";
      }
    })();
  });

  generateBtn.addEventListener("click", () => {
    passwordInput.value = generatePassword(DEFAULT_PASSWORD_OPTIONS);
  });

  addBtn.addEventListener("click", () => {
    void (async () => {
      const input = {
        site: siteInput.value,
        username: usernameInput.value,
        password: passwordInput.value,
        notes: notesInput.value
      };
      const problem = validateVaultEntry(input);
      if (problem) {
        status.textContent = problem;
        return;
      }
      try {
        await addVaultEntry(input, caps.storage, vaultKey);
        siteInput.value = "";
        usernameInput.value = "";
        passwordInput.value = "";
        notesInput.value = "";
        status.textContent = `Saved ${normalizeSite(input.site)} — fill it from the list when you're on that site.`;
        await loadVault();
      } catch (err) {
        status.textContent = err instanceof Error ? err.message : "Could not save.";
      }
    })();
  });

  /* Backup ------------------------------------------------------------------ */
  exportBtn.addEventListener("click", () => {
    void (async () => {
      if (entries.length === 0) {
        status.textContent = "Nothing to export yet — add a login first.";
        return;
      }
      const passphrase = window.prompt(
        "Backup passphrase (min 4 characters). Use your master password for one-passphrase simplicity. Keep it safe — it's the only way to open this backup.",
        ""
      );
      if (passphrase === null) return;
      const blob = await exportVaultBackup(entries, passphrase);
      caps.saveFile(
        new TextEncoder().encode(serializeVaultBackup(blob)),
        vaultBackupFilename(),
        "application/json"
      );
      status.textContent = `Exported ${entries.length} login${entries.length === 1 ? "" : "s"} to an encrypted backup.`;
    })().catch((err) => {
      status.textContent = err instanceof Error ? err.message : "Could not export.";
    });
  });

  importBtn.addEventListener("click", () => importFile.click());

  importFile.addEventListener("change", () => {
    void (async () => {
      const file = importFile.files?.[0];
      if (!file) return;
      try {
        const text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === "string") resolve(reader.result);
            else reject(new Error("Could not read that file."));
          };
          reader.onerror = () => reject(new Error("Could not read that file."));
          reader.readAsText(file);
        });
        const blob = parseVaultBackupFile(text);
        const passphrase = window.prompt("Passphrase for this backup file:", "");
        if (passphrase === null) return;
        const backupEntries = await importVaultBackup(blob, passphrase);
        if (backupEntries.length === 0) {
          status.textContent = "That backup contains no logins.";
          return;
        }
        if (
          !window.confirm(
            `Restore ${backupEntries.length} login${backupEntries.length === 1 ? "" : "s"} from this backup? This replaces your ${entries.length} current login${entries.length === 1 ? "" : "s"}.`
          )
        ) {
          return;
        }
        await clearVaultEntries(caps.storage, vaultKey);
        for (const entry of backupEntries) {
          await addVaultEntry(vaultBackupEntryToInput(entry), caps.storage, vaultKey);
        }
        status.textContent = `Restored ${backupEntries.length} login${backupEntries.length === 1 ? "" : "s"} from the backup.`;
        await loadVault();
      } catch (err) {
        status.textContent = err instanceof Error ? err.message : "Could not restore that backup.";
      } finally {
        importFile.value = "";
      }
    })();
  });

  deleteAll.addEventListener("click", () => {
    void (async () => {
      const count = entries.length;
      if (count === 0) {
        status.textContent = "No logins to delete.";
        return;
      }
      if (!window.confirm(`Delete all ${count} login${count === 1 ? "" : "s"}? This cannot be undone — export a backup first.`)) return;
      await clearVaultEntries(caps.storage, vaultKey);
      entries = [];
      status.textContent = `Deleted all ${count} login${count === 1 ? "" : "s"}.`;
      await renderList();
    })().catch((err) => {
      status.textContent = err instanceof Error ? err.message : "Could not delete logins.";
    });
  });

  void refreshCurrentHost().then(() => void refreshLockUi()).then(() => void loadVault());
  return () => {};
}
