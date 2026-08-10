import { localStorageArea, type KvStorage } from "./storage-utils";
import { TOOLS } from "./tool-manifest";

export type Theme = "light" | "dark" | "system";

/** Per-tool on/off switches. Everything is local; toggles just stop the work. */
export interface ToolToggles {
  /** Index page text for full-text history search (default ON). */
  historyIndex: boolean;
  /** Remember text copied in the browser (default ON). */
  clipboardHistory: boolean;
  /** Auto-save form fields so a refresh can't lose a long form (default OFF). */
  draftVault: boolean;
  /** Auto-click "reject"/"decline" on cookie consent banners (default OFF). */
  cookieReject: boolean;
  /** Pause autoplaying video/audio (default OFF). */
  autoplayKiller: boolean;
  /** Type ;alias + space to expand saved snippets (default OFF). */
  textExpander: boolean;
  /** Paste as plain text into inputs (default OFF). */
  pasteCleaner: boolean;
  /** Floating mic button to dictate into any field (default OFF). */
  dictation: boolean;
  /** Local archive of AI chat conversations (ChatGPT/Claude/Gemini) — default OFF. */
  chatVault: boolean;
  /** Ctrl+Shift+K unified search palette — inert until the shortcut is pressed (default ON). */
  commandPalette: boolean;
  /** Per-site schedules that hide distracting pages behind an overlay (default OFF). */
  focusBlocker: boolean;
  /** Track active time per site locally for screen-time stats (default ON). */
  screenTime: boolean;
  /** Auto-snapshot open tabs so a crash never loses them (default ON — passive). */
  sessionBackup: boolean;
  /** Suspend inactive tabs to save memory (default OFF — changes behavior). */
  tabSuspender: boolean;
  /** Route downloads into folders by type (default OFF — changes file locations). */
  downloadOrganizer: boolean;
  /** Double-click a word to see its offline definition (default OFF). */
  wordLookup: boolean;
}

export interface OneKitSettings {
  theme: Theme;
  tools: ToolToggles;
  /** Per-alias snippet enablement is stored with snippets; this master switch gates the engine. */
  textExpanderEnabled: boolean;
  /** False until the first-run onboarding picker is dismissed. */
  onboarded: boolean;
}

export const SETTINGS_STORAGE_KEY = "ok.settings";

export const DEFAULT_SETTINGS: OneKitSettings = {
  theme: "system",
  tools: {
    historyIndex: true,
    clipboardHistory: true,
    draftVault: false,
    cookieReject: false,
    autoplayKiller: false,
    textExpander: false,
    pasteCleaner: false,
    dictation: false,
    chatVault: false,
    commandPalette: true,
    focusBlocker: false,
    screenTime: true,
    sessionBackup: true,
    tabSuspender: false,
    downloadOrganizer: false,
    wordLookup: false
  },
  textExpanderEnabled: true,
  onboarded: false
};

/**
 * Settings labels per toggle, derived from the tool manifest so the
 * manifest is the single source of truth for every tool.
 */
export const TOOL_LABELS: Record<keyof ToolToggles, string> = (() => {
  const labels = {} as Record<keyof ToolToggles, string>;
  for (const tool of TOOLS) {
    if (tool.toggleKey) {
      labels[tool.toggleKey] = tool.settingLabel ?? tool.name;
    }
  }
  return labels;
})();

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

export function isToolToggle(key: string): key is keyof ToolToggles {
  return key in DEFAULT_SETTINGS.tools;
}

/** Coerces arbitrary stored JSON into a valid OneKitSettings (honest fallbacks). */
export function normalizeSettings(raw: unknown): OneKitSettings {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const toolsRaw = (obj.tools && typeof obj.tools === "object" ? obj.tools : {}) as Record<string, unknown>;
  const tools = { ...DEFAULT_SETTINGS.tools };
  for (const key of Object.keys(DEFAULT_SETTINGS.tools) as (keyof ToolToggles)[]) {
    if (typeof toolsRaw[key] === "boolean") tools[key] = toolsRaw[key] as boolean;
  }
  return {
    theme: isTheme(obj.theme) ? obj.theme : DEFAULT_SETTINGS.theme,
    tools,
    textExpanderEnabled:
      typeof obj.textExpanderEnabled === "boolean"
        ? obj.textExpanderEnabled
        : DEFAULT_SETTINGS.textExpanderEnabled,
    onboarded:
      typeof obj.onboarded === "boolean" ? obj.onboarded : DEFAULT_SETTINGS.onboarded
  };
}

export async function loadSettings(storage?: KvStorage): Promise<OneKitSettings> {
  const area = storage ?? localStorageArea();
  const raw = await area.get(SETTINGS_STORAGE_KEY);
  return normalizeSettings(raw[SETTINGS_STORAGE_KEY]);
}

export async function saveSettings(
  settings: OneKitSettings,
  storage?: KvStorage
): Promise<void> {
  const area = storage ?? localStorageArea();
  await area.set({ [SETTINGS_STORAGE_KEY]: settings });
}

export async function updateSettings(
  patch: Partial<OneKitSettings> | ((prev: OneKitSettings) => Partial<OneKitSettings>),
  storage?: KvStorage
): Promise<OneKitSettings> {
  const prev = await loadSettings(storage);
  const applied = typeof patch === "function" ? patch(prev) : patch;
  const next = { ...prev, ...applied };
  await saveSettings(next, storage);
  return next;
}
