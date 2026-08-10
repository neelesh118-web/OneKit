/**
 * Downloads subfolder sanitization — turns a user-typed folder name into
 * a safe relative path for chrome.downloads. Strips drive letters, parent
 * traversal, and characters the OS won't accept in a path segment.
 */

const ILLEGAL = /[<>:"|?*\u0000-\u001f]/g;

export function sanitizeFolder(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/\\+/g, "/")
    .replace(/^\/+|\/+$/g, "")
    // A leading drive letter ("C:") is not a folder name — drop it.
    .replace(/^[A-Za-z]:/, "");
  const segments = cleaned
    .split("/")
    .map((s) => s.replace(ILLEGAL, "").trim())
    .filter((s) => s !== "" && s !== "." && s !== "..");
  return segments.join("/");
}
