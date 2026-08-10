import { describe, expect, it } from "vitest";
import {
  assessPageRisk,
  assessUrlRisk,
  checkPage,
  combineScamCheck,
  computePageRiskMetaFromDocument,
  countUrgency,
  type PageRiskMeta
} from "../src/core/scam-radar";

const okMeta = (overrides: Partial<PageRiskMeta> = {}): PageRiskMeta => ({
  hasContact: true,
  hasPrivacyPolicy: true,
  hasSocialLinks: true,
  urgencyScore: 0,
  paymentOnly: false,
  textSample: "Welcome to our shop. We have been trading since 2010.",
  ...overrides
});

describe("scam-radar", () => {
  it("flags non-HTTPS and IP hosts", () => {
    const r = assessUrlRisk("http://192.168.1.1/login");
    expect(r.points).toBeGreaterThanOrEqual(6);
    expect(r.reasons.some((x) => x.includes("HTTPS"))).toBe(true);
    expect(r.reasons.some((x) => x.includes("IP address"))).toBe(true);
  });

  it("flags suspicious TLDs and punycode", () => {
    expect(assessUrlRisk("https://free-gift.xyz/claim").points).toBeGreaterThanOrEqual(2);
    expect(assessUrlRisk("https://xn--80ak6aa92e.com/").reasons.some((x) => x.includes("punycode"))).toBe(true);
  });

  it("accepts a normal https domain with no points", () => {
    const r = assessUrlRisk("https://example.com/products?utm_source=x");
    expect(r.points).toBe(0);
    expect(r.reasons).toEqual([]);
  });

  it("counts urgency phrases with a cap", () => {
    expect(countUrgency("LIMITED TIME 90% OFF act now final sale")).toBeGreaterThanOrEqual(2);
    expect(countUrgency("ordinary text")).toBe(0);
  });

  it("scores a shady page", () => {
    const r = assessPageRisk(okMeta({ hasContact: false, hasPrivacyPolicy: false, hasSocialLinks: false, urgencyScore: 4, paymentOnly: true }));
    expect(r.points).toBeGreaterThanOrEqual(7);
    expect(r.reasons.some((x) => x.includes("No email"))).toBe(true);
    expect(r.reasons.some((x) => x.includes("pressure"))).toBe(true);
  });

  it("scores a legit page low", () => {
    expect(assessPageRisk(okMeta()).points).toBe(0);
  });

  it("combines into levels", () => {
    expect(combineScamCheck({ points: 0, reasons: [] }, { points: 0, reasons: [] }).level).toBe("ok");
    expect(combineScamCheck({ points: 4, reasons: [] }, { points: 0, reasons: [] }).level).toBe("caution");
    expect(combineScamCheck({ points: 8, reasons: [] }, { points: 3, reasons: [] }).level).toBe("warning");
  });

  it("computes page meta from a live document", () => {
    document.body.innerHTML = `
      <p>Limited time! 90% off everything. Click here to verify your account.</p>
      <a href="https://facebook.com/x">fb</a>
      <form>buy now</form>
    `;
    const meta = computePageRiskMetaFromDocument(document);
    expect(meta.hasContact).toBe(false);
    expect(meta.hasPrivacyPolicy).toBe(false);
    expect(meta.hasSocialLinks).toBe(true);
    expect(meta.urgencyScore).toBeGreaterThanOrEqual(2);
  });

  it("checkPage returns a full result", () => {
    const result = checkPage("https://free-stuff.xyz/win", okMeta({ hasContact: false }));
    expect(result.score).toBeGreaterThanOrEqual(2);
    expect(["ok", "caution", "warning"]).toContain(result.level);
  });
});
