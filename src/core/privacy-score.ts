/**
 * Privacy score — a simple A–F footprint score of your browser setup.
 *
 * Privacy tools are "too complicated to set up" (the #1 consumer privacy
 * complaint), so this collapses everything into one letter. It measures
 * what's locally visible: cookie count, history size, whether the user has
 * enabled OneKit's own protective tools, and how many sites have stored
 * data. Pure local math on data the extension already has.
 */

export interface PrivacyInput {
  /** Number of cookies currently stored in the browser. */
  cookieCount: number;
  /** Number of unique hosts in browsing history (last 90 days). */
  historyHosts: number;
  /** Whether OneKit's protective tools are enabled (cookie reject, PII redact, scam radar). */
  protectionsEnabled: number;
  /** Total protections available. */
  protectionsTotal: number;
  /** Whether the password vault has a master password set. */
  vaultProtected: boolean;
}

export interface PrivacyScore {
  /** 0–100, higher is more private. */
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  /** One-line honest summary. */
  summary: string;
  /** Concrete next steps, most impactful first. */
  recommendations: string[];
}

export function gradeFor(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 55) return "C";
  if (score >= 35) return "D";
  return "F";
}

/**
 * Computes the score. Cookie and history footprints are graded on a curve
 * (fewer is better); protections and vault protection add points.
 */
export function computePrivacyScore(input: PrivacyInput): PrivacyScore {
  let score = 55;

  // Cookie footprint: light (<50) is a bonus; heavy (2000+) is a real penalty.
  if (input.cookieCount < 50) score += 10;
  else if (input.cookieCount < 200) score += 5;
  else score -= Math.min(20, Math.max(0, input.cookieCount / 100));

  // History footprint: a short trail is great; 500+ hosts is a big shadow.
  if (input.historyHosts < 30) score += 10;
  else if (input.historyHosts < 100) score += 5;
  else score -= Math.min(15, Math.max(0, input.historyHosts / 40));

  // Protections: each enabled protective tool adds points (max 15).
  if (input.protectionsTotal > 0) {
    const share = input.protectionsEnabled / input.protectionsTotal;
    score += share * 15;
  }

  // Vault protection.
  if (input.vaultProtected) score += 5;

  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const grade = gradeFor(clamped);
  const recommendations: string[] = [];
  if (input.cookieCount > 200) recommendations.push("Clear cookies for sites you don't use — Privacy Sweep can do it in one click.");
  if (input.historyHosts > 150) recommendations.push("Clear history older than a month — a smaller trail means less tracking.");
  if (input.protectionsEnabled < input.protectionsTotal) {
    recommendations.push("Turn on the protective tools you're missing (cookie auto-reject, PII redaction, scam-site radar).");
  }
  if (!input.vaultProtected) recommendations.push("Set a master password on your local password vault so saved credentials are encrypted at rest.");
  if (recommendations.length === 0) recommendations.push("Your setup looks clean — keep the protective tools on and review once a month.");

  const summary = `Grade ${grade} — ${clamped}/100. Your browser footprint is ${grade === "A" || grade === "B" ? "in good shape" : grade === "C" ? "average" : "heavier than it needs to be"}.`;
  return { score: clamped, grade, summary, recommendations };
}
