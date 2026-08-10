/**
 * Window resizer — common viewport presets for testing responsive layouts.
 *
 * Devs and designers constantly resize windows to check breakpoints. These
 * presets are the standard device sizes; the popup applies one to the
 * current window via chrome.windows.update. Pure math here, no browser
 * calls, so it's fully testable.
 */

export interface ViewportPreset {
  id: string;
  label: string;
  /** Viewport (content area) size in CSS pixels. */
  width: number;
  height: number;
  /** Approximate outer-window chrome to add so the viewport lands on target. */
  chromeX: number;
  chromeY: number;
  device?: string;
}

export const VIEWPORT_PRESETS: ViewportPreset[] = [
  { id: "desktop-hd", label: "Desktop HD", width: 1920, height: 1080, chromeX: 16, chromeY: 96, device: "desktop" },
  { id: "desktop", label: "Desktop", width: 1440, height: 900, chromeX: 16, chromeY: 96, device: "desktop" },
  { id: "laptop", label: "Laptop", width: 1366, height: 768, chromeX: 16, chromeY: 96, device: "desktop" },
  { id: "small-laptop", label: "Small laptop", width: 1280, height: 800, chromeX: 16, chromeY: 96, device: "desktop" },
  { id: "ipad-pro", label: "iPad Pro", width: 1024, height: 1366, chromeX: 16, chromeY: 96, device: "tablet" },
  { id: "ipad", label: "iPad", width: 768, height: 1024, chromeX: 16, chromeY: 96, device: "tablet" },
  { id: "tablet", label: "Tablet", width: 834, height: 1112, chromeX: 16, chromeY: 96, device: "tablet" },
  { id: "mobile-l", label: "Phone L", width: 430, height: 932, chromeX: 16, chromeY: 96, device: "phone" },
  { id: "mobile-m", label: "Phone M", width: 390, height: 844, chromeX: 16, chromeY: 96, device: "phone" },
  { id: "mobile-s", label: "Phone S", width: 360, height: 780, chromeX: 16, chromeY: 96, device: "phone" }
];

export function presetById(id: string): ViewportPreset | undefined {
  return VIEWPORT_PRESETS.find((p) => p.id === id);
}

export interface WindowSizeRequest {
  /** Outer window width in px (preset width + chrome). */
  width: number;
  /** Outer window height in px (preset height + chrome). */
  height: number;
  presetId: string;
  presetLabel: string;
}

/** Converts a preset into the outer-window size chrome.windows.update needs. */
export function windowSizeForPreset(preset: ViewportPreset): WindowSizeRequest {
  return {
    width: Math.max(200, preset.width + preset.chromeX),
    height: Math.max(200, preset.height + preset.chromeY),
    presetId: preset.id,
    presetLabel: preset.label
  };
}

/** Smallest preset that still contains the given viewport (or null). */
export function presetContaining(width: number, height: number): ViewportPreset | null {
  const fits = VIEWPORT_PRESETS.filter((p) => width <= p.width && height <= p.height);
  if (fits.length === 0) return null;
  return fits.reduce((min, p) => (p.width * p.height < min.width * min.height ? p : min));
}
