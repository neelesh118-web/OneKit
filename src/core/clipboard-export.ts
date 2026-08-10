/**
 * Clipboard export — turn clipboard history into a readable file.
 * Pure local formatting over the existing clipboard store.
 */

import type { ClipboardEntry } from "./clipboard-store";

export function clipboardToMarkdown(entries: ClipboardEntry[]): string {
  if (entries.length === 0) return "# Clipboard history\n\n(empty)";
  const lines = ["# Clipboard history", ""];
  for (const entry of entries) {
    const when = new Date(entry.ts).toLocaleString();
    lines.push(`- **${when}**${entry.url ? ` · ${entry.url}` : ""}: ${entry.text.replace(/\n/g, " ").slice(0, 300)}`);
  }
  return lines.join("\n");
}

export function clipboardToPlainText(entries: ClipboardEntry[]): string {
  return entries.map((e) => e.text).join("\n\n---\n\n");
}
