/**
 * Cookie banner auto-reject — finds the "reject/decline" action on consent
 * banners and clicks it. Pure classification here; the DOM hook lives in the
 * content script. NEVER clicks "accept"; if only "accept" exists, we do
 * nothing (honest behavior — we don't fake consent).
 */

export type ButtonIntent = "reject" | "accept" | "manage" | "none";

const REJECT_PATTERNS = [
  /^reject all$/i,
  /^reject$/i,
  /^decline all$/i,
  /^decline$/i,
  /^deny$/i,
  /^refuse$/i,
  /^no thanks$/i,
  /^not now$/i,
  /^accept none$/i,
  /^only necessary$/i,
  /^necessary only$/i,
  /^continue without accepting$/i,
  /^reject non-essential/i,
  /^reject optional/i
];

const ACCEPT_PATTERNS = [
  /^accept all$/i,
  /^accept$/i,
  /^agree$/i,
  /^allow all$/i,
  /^i agree$/i,
  /^ok$/i,
  /^got it$/i,
  /^accept and continue$/i
];

const MANAGE_PATTERNS = [
  /manage (my )?(cookie|consent|preferences)/i,
  /cookie settings/i,
  /preferences/i,
  /customize/i,
  /show details/i,
  /more options/i,
  /settings/i
];

/** Classifies a button/link's text into an intent. "none" = irrelevant. */
export function classifyButtonText(text: string): ButtonIntent {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return "none";
  for (const p of REJECT_PATTERNS) {
    if (p.test(t)) return "reject";
  }
  for (const p of ACCEPT_PATTERNS) {
    if (p.test(t)) return "accept";
  }
  for (const p of MANAGE_PATTERNS) {
    if (p.test(t)) return "manage";
  }
  return "none";
}

/**
 * Safety gate: is this button part of a cookie/consent banner rather than
 * ordinary page content? Checks id/class tokens on the element and its
 * ancestors, then falls back to fixed/sticky positioning (banners are
 * almost always fixed or sticky). Prevents OneKit from ever clicking a
 * plain "Reject" link that is really page content.
 */
export function isLikelyBannerContext(el: HTMLElement): boolean {
  const contextTokens = /cookie|consent|gdpr|ccpa|privacy|banner|notice|compliance|legal/i;
  let node: HTMLElement | null = el;
  for (let depth = 0; node && depth < 6; depth++) {
    const idClass = `${node.id} ${node.className ?? ""}`;
    if (contextTokens.test(idClass)) return true;
    node = node.parentElement;
  }
  // Positioned-as-overlay check (fixed/sticky).
  const style = window.getComputedStyle(el);
  if (style.position === "fixed" || style.position === "sticky") return true;
  node = el.parentElement;
  for (let depth = 0; node && depth < 6; depth++) {
    const style2 = window.getComputedStyle(node);
    if (style2.position === "fixed" || style2.position === "sticky") return true;
    node = node.parentElement;
  }
  return false;
}

/**
 * Finds the best reject-style action inside `root`. Searches interactive
 * elements (button, a[role=button], [role=button], a, summary, input[type=button]).
 * Prefers exact "reject all" over generic "reject"; never returns an accept
 * button; never returns a button that is not inside a banner-like context.
 * Returns null when there is nothing safe to click.
 */
export function findRejectButton(root: ParentNode): HTMLElement | null {
  const selector = [
    "button",
    "a",
    "[role='button']",
    "summary",
    "input[type='button']",
    "input[type='submit']",
    "[class*='btn']",
    "[class*='button']"
  ].join(",");

  let nodes: NodeListOf<Element>;
  try {
    nodes = root.querySelectorAll(selector);
  } catch {
    return null;
  }

  let genericReject: HTMLElement | null = null;
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.closest("script, style, noscript")) continue;
    const text = (node.textContent ?? "").trim().replace(/\s+/g, " ");
    if (!text || text.length > 60) continue;
    const intent = classifyButtonText(text);
    if (intent === "reject") {
      // Never click anything that isn't clearly a banner/consent element.
      if (!isLikelyBannerContext(node)) continue;
      // Prefer a strong "reject all" exact match; keep the first generic as fallback.
      if (/^reject all$|^decline all$|^accept none$|^only necessary$|^necessary only$/i.test(text)) {
        return node;
      }
      if (!genericReject) genericReject = node;
    }
  }
  return genericReject;
}
