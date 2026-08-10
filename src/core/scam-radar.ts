/**
 * Scam-site radar — local heuristics that flag likely scam/fraud pages
 * BEFORE you enter a card or share personal data. Everything is computed
 * on-device from the URL and the page's own content; no lookup service,
 * no network. It is a tripwire, not a verdict.
 */

export type RiskLevel = "ok" | "caution" | "warning";

export interface ScamCheckResult {
  score: number; // 0..10
  level: RiskLevel;
  reasons: string[];
}

export interface PageRiskMeta {
  /** True when an email address or phone number appears anywhere. */
  hasContact: boolean;
  /** True when the page mentions privacy/terms. */
  hasPrivacyPolicy: boolean;
  hasSocialLinks: boolean;
  /** Urgency/pressure language: "limited time", "90% off", "act now"… */
  urgencyScore: number; // 0..5
  /** True when the page seems to exist only to take payment/orders. */
  paymentOnly: boolean;
  /** Page title/text (used for a few text checks). */
  textSample: string;
}

export const SUSPICIOUS_TLDS = new Set([
  "xyz", "top", "click", "gq", "tk", "ml", "ga", "cf", "icu", "cyou",
  "rest", "cam", "work", "lol", "fun", "bid", "date", "racing", "loan",
  "win", "stream", "review", "country", "kim", "science", "party", "link"
]);

export const URGENCY_PHRASES = [
  /limited time/i,
  /\b\d{1,3}%\s*off\b/i,
  /act now/i,
  /only \d+ (left|remaining|in stock)/i,
  /urgent/i,
  /final (sale|chance|warning)/i,
  /claim (your )?(prize|reward)/i,
  /congratulations.*(winner|won)/i,
  /verify your (account|identity)/i
];

/** Local checks on the URL alone. Returns points + reasons. */
export function assessUrlRisk(rawUrl: string): { points: number; reasons: string[] } {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { points: 3, reasons: ["The link is not a valid web address."] };
  }
  const reasons: string[] = [];
  let points = 0;
  const host = url.hostname;

  if (url.protocol !== "https:") {
    points += 3;
    reasons.push("The page is not served over HTTPS — anything you type can be read in transit.");
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    points += 3;
    reasons.push("The site is an IP address, not a real domain — typical of scam infrastructure.");
  }
  const tld = host.split(".").pop()?.toLowerCase() ?? "";
  if (SUSPICIOUS_TLDS.has(tld)) {
    points += 2;
    reasons.push(`The domain ends in .${tld}, a top-level domain heavily used by scam sites.`);
  }
  if (host.includes("xn--")) {
    points += 3;
    reasons.push("The domain uses punycode (obfuscated international characters) — a classic lookalike trick.");
  }
  const labels = host.split(".");
  if (labels.length > 4) {
    points += 2;
    reasons.push("Unusually long domain chain — often used to hide the real brand.");
  }
  const digitCount = (host.match(/\d/g) ?? []).length;
  if (host.length >= 8 && digitCount >= 4) {
    points += 1;
    reasons.push("The domain is heavy with numbers, common in auto-generated scam domains.");
  }
  return { points: Math.min(points, 10), reasons };
}

/** Local checks on page content. Returns points + reasons. */
export function assessPageRisk(meta: PageRiskMeta): { points: number; reasons: string[] } {
  const reasons: string[] = [];
  let points = 0;

  if (!meta.hasContact) {
    points += 2;
    reasons.push("No email address or phone number anywhere on the page — real businesses publish contact details.");
  }
  if (!meta.hasPrivacyPolicy) {
    points += 1;
    reasons.push("No privacy policy or terms mention — most legitimate stores have one.");
  }
  if (!meta.hasSocialLinks) {
    points += 1;
    reasons.push("No social links found (many scam shops avoid them).");
  }
  if (meta.urgencyScore >= 3) {
    points += 2;
    reasons.push("Heavy urgency language ('limited time', big discounts, 'act now') — a classic pressure tactic.");
  } else if (meta.urgencyScore >= 1) {
    points += 1;
    reasons.push("Some urgency/pressure language detected.");
  }
  if (meta.paymentOnly) {
    points += 1;
    reasons.push("The page shows payment/order framing with almost no real content about the business.");
  }
  return { points: Math.min(points, 10), reasons };
}

export function combineScamCheck(
  urlPoints: { points: number; reasons: string[] },
  pagePoints: { points: number; reasons: string[] }
): ScamCheckResult {
  const score = Math.min(10, urlPoints.points + pagePoints.points);
  const reasons = [...urlPoints.reasons, ...pagePoints.reasons];
  const level: RiskLevel = score >= 7 ? "warning" : score >= 4 ? "caution" : "ok";
  return { score, level, reasons };
}

/** Convenience one-call version for the popup. */
export function checkPage(rawUrl: string, meta: PageRiskMeta): ScamCheckResult {
  return combineScamCheck(assessUrlRisk(rawUrl), assessPageRisk(meta));
}

/** Counts urgency phrases in a text sample (0..5). */
export function countUrgency(text: string): number {
  let count = 0;
  for (const pattern of URGENCY_PHRASES) {
    if (pattern.test(text)) count++;
  }
  return Math.min(count, 5);
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_RE = /(?:\+?\d[\d\s().-]{6,}\d)/;
const SOCIAL_RE = /\(?(?:facebook|instagram|twitter|linkedin|tiktok|youtube)\.com\/?\)?/i;
const PAY_FRAMING_RE = /(add to (?:cart|basket)|buy now|checkout|place order|pay now|paypal|debit card|credit card|wire transfer|zelle|venmo)/i;

/**
 * Computes PageRiskMeta from a live document (content script side).
 * Pure enough to unit-test with jsdom.
 */
export function computePageRiskMetaFromDocument(doc: Document): PageRiskMeta {
  // innerText is the browser-accurate source; textContent is the jsdom-safe
  // fallback (jsdom does not implement innerText).
  const rawText = doc.body?.innerText ?? doc.body?.textContent ?? "";
  const bodyText = rawText.replace(/\s+/g, " ").trim();
  const htmlSample = (doc.documentElement?.innerHTML ?? "").slice(0, 200_000);
  const hasContact = EMAIL_RE.test(bodyText) || PHONE_RE.test(bodyText);
  const hasPrivacyPolicy = /privacy|terms of (use|service)|legal/i.test(htmlSample);
  const hasSocialLinks = SOCIAL_RE.test(htmlSample);
  const urgencyScore = countUrgency(bodyText.slice(0, 50_000));
  const textLength = bodyText.length;
  const paymentOnly = PAY_FRAMING_RE.test(bodyText) && textLength < 1500;
  return {
    hasContact,
    hasPrivacyPolicy,
    hasSocialLinks,
    urgencyScore,
    paymentOnly,
    textSample: bodyText.slice(0, 2000)
  };
}
