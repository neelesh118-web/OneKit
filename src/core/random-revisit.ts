/**
 * Random revisit — resurface a random saved page or highlight.
 *
 * Read-later lists grow into graveyards ("saved 500 articles but never
 * opened them again"). This picks a random unread item so your library
 * works for you again. Pure local: nothing is fetched, just a weighted
 * pick from what's already stored. 100% on-device.
 */

export interface SavedItemLike {
  id: string;
  url: string;
  title: string;
  read?: boolean;
  savedAt?: number;
}

export interface RandomPickOptions {
  /** Bias toward unread items (default true — the whole point). */
  preferUnread?: boolean;
  /** If true, never return a read item unless there are no unread ones. */
  unreadOnly?: boolean;
  now?: number;
}

/**
 * Picks a random item, weighted: unread items get 3× the weight of read
 * ones (and read items are excluded entirely when unreadOnly).
 * Returns null when there's nothing to pick.
 */
export function pickRandomItem<T extends SavedItemLike>(
  items: T[],
  options: RandomPickOptions = {}
): T | null {
  if (items.length === 0) return null;
  const preferUnread = options.preferUnread ?? true;
  const unreadOnly = options.unreadOnly ?? false;
  const unread = items.filter((i) => !i.read);
  const read = items.filter((i) => i.read);

  if (unread.length === 0) return read[Math.floor(Math.random() * read.length)] ?? null;
  if (unreadOnly) return unread[Math.floor(Math.random() * unread.length)] ?? null;
  if (!preferUnread) return items[Math.floor(Math.random() * items.length)] ?? null;

  // Unread gets 3/4 of the probability mass when both pools exist.
  if (read.length === 0) return unread[Math.floor(Math.random() * unread.length)] ?? null;
  const roll = Math.random();
  const source = roll < 0.75 ? unread : read;
  return source[Math.floor(Math.random() * source.length)] ?? null;
}

/** Deterministic picker for tests (seeded instead of Math.random). */
export function pickRandomItemSeeded<T extends SavedItemLike>(
  items: T[],
  random: () => number,
  options: RandomPickOptions = {}
): T | null {
  const originalRandom = Math.random;
  Math.random = random;
  try {
    return pickRandomItem(items, options);
  } finally {
    Math.random = originalRandom;
  }
}

/** Reads the saved pool (read-later + highlights) into a unified item list. */
export function mergeSavedPools<T extends SavedItemLike>(
  readLater: T[],
  highlights: Array<{ id: string; url: string; text: string }>
): T[] {
  const highlightItems = highlights.map((h) => ({
    id: `h-${h.id}`,
    url: h.url,
    title: h.text.slice(0, 80),
    read: true
  })) as T[];
  return [...readLater, ...highlightItems];
}
