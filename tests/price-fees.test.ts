import { describe, expect, it } from "vitest";
import { formatMoney, parsePrice, priceWithFees } from "../src/core/price-fees";

describe("price with fees", () => {
  it("computes tax, shipping and fees", () => {
    const r = priceWithFees({ price: 100, taxPercent: 8, shipping: 10, feePercent: 10 });
    expect(r.subtotal).toBe(100);
    expect(r.taxAmount).toBe(8);
    expect(r.shippingAmount).toBe(10);
    expect(r.feeAmount).toBe(10);
    expect(r.total).toBe(128);
    expect(r.sellerKeeps).toBe(90);
  });

  it("applies discounts before taxes/fees", () => {
    const r = priceWithFees({ price: 100, discountPercent: 25, taxPercent: 10 });
    expect(r.subtotal).toBe(75);
    expect(r.taxAmount).toBe(7.5);
    expect(r.total).toBe(82.5);
  });

  it("clamps negative inputs to zero", () => {
    const r = priceWithFees({ price: -5, taxPercent: -2, shipping: -3 });
    expect(r.subtotal).toBe(0);
    expect(r.total).toBe(0);
  });

  it("parses price strings", () => {
    expect(parsePrice("$1,299.00")).toBe(1299);
    expect(parsePrice("£45,5")).toBe(45.5);
    expect(parsePrice("1 299")).toBe(1299);
    expect(parsePrice("free")).toBeNull();
  });

  it("formats money", () => {
    expect(formatMoney(128)).toBe("$128.00");
    expect(formatMoney(99.5)).toBe("$99.50");
  });
});
