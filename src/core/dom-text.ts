/**
 * DOM text helpers for the on-page tools (text expander, draft restore).
 * Small, dependency-free utilities over the live document, kept separate
 * from the content-script entrypoint so the tricky node/offset math is
 * unit-testable in jsdom.
 */

/**
 * Returns the text before the caret inside a contentEditable element, or
 * null when the caret isn't a collapsed selection inside the element.
 * Walks text nodes in document order (robust to Chrome's node splitting in
 * rich editors) instead of relying on Range.toString().
 */
export function textBeforeCaretIn(element: HTMLElement): string | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!range.collapsed) return null;
  if (!element.contains(range.startContainer)) return null;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let out = "";
  let node: Node | null = walker.nextNode();
  while (node) {
    const text = node.textContent ?? "";
    if (node === range.startContainer) {
      out += text.slice(0, range.startOffset);
      break;
    }
    out += text;
    node = walker.nextNode();
  }
  return out;
}

/**
 * Builds a Range covering character offsets [start, end) within a node,
 * walking text nodes in document order. Returns null when the offsets
 * can't be mapped (e.g. they fall past the end of the text content).
 */
export function rangeForCharOffsets(
  container: Node,
  start: number,
  end: number
): Range | null {
  if (start < 0 || end < start) return null;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let count = 0;
  let startNode: Node | null = null;
  let startOffset = 0;
  let endNode: Node | null = null;
  let endOffset = 0;
  let node: Node | null = walker.nextNode();
  while (node) {
    const len = (node.textContent ?? "").length;
    if (startNode === null && count + len >= start) {
      startNode = node;
      startOffset = start - count;
    }
    if (endNode === null && count + len >= end) {
      endNode = node;
      endOffset = end - count;
    }
    if (startNode !== null && endNode !== null) break;
    count += len;
    node = walker.nextNode();
  }
  if (startNode === null || endNode === null) return null;
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

/**
 * Finds a form field by the identity stored in a draft key — by name
 * first, then by id. Returns null when nothing matches. Uses
 * getElementsByName (an exact string match, immune to selector-escaping
 * issues) rather than building an attribute selector.
 */
export function findFieldForDraft(identity: string): HTMLElement | null {
  const byName = document.getElementsByName(identity)[0];
  if (byName) return byName;
  return document.getElementById(identity);
}
