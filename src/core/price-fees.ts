/**
 * Price-with-fees calculator — the real total is never what's on the tag.
 *
 * Add tax %, shipping, and marketplace/platform fees to any price and see
 * the true cost — including the seller-side math (what you keep after a
 * marketplace takes its cut). Pure local math, no network. Works on any
 * product page: copy the price into the popup or let it pull the most
 * likely price element.
 */

export interface FeeInput {
  /** Base price in the same currency for all fields. */
  price: number;
  /** Tax as a percentage (e.g. 8 for 8%). */
  taxPercent?: number;
  /** Flat shipping. */
  shipping?: number;
  /** Marketplace/platform fee as a percentage of the item price. */
  feePercent?: number;
  /** Flat listing fee. */
  feeFlat?: number;
  /** Optional discount percentage off the base price. */
  discountPercent?: number;
}

export interface FeeResult {
  /** Price after discount but before tax/shipping/fees. */
  subtotal: number;
  taxAmount: number;
  shippingAmount: number;
  feeAmount: number;
  /** Buyer pays: subtotal + tax + shipping + fees. */
  total: number;
  /** Seller keeps after fees (total minus feeAmount). */
  sellerKeeps: number;
}

export function priceWithFees(input: FeeInput): FeeResult {
  const price = Math.max(0, Number(input.price) || 0);
  const discount = Math.max(0, Math.min(100, Number(input.discountPercent) || 0));
  const subtotal = price * (1 - discount / 100);
  const taxAmount = subtotal * (Math.max(0, Number(input.taxPercent) || 0) / 100);
  const shippingAmount = Math.max(0, Number(input.shipping) || 0);
  const feeAmount = subtotal * (Math.max(0, Number(input.feePercent) || 0) / 100) + Math.max(0, Number(input.feeFlat) || 0);
  const total = subtotal + taxAmount + shippingAmount + feeAmount;
  return {
    subtotal: round2(subtotal),
    taxAmount: round2(taxAmount),
    shippingAmount: round2(shippingAmount),
    feeAmount: round2(feeAmount),
    total: round2(total),
    sellerKeeps: round2(subtotal - feeAmount)
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatMoney(n: number, symbol = "$"): string {
  return `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Parses a price string ("$1,299.00", "£45,5", "1 299") into a number. */
export function parsePrice(raw: string): number | null {
  let cleaned = raw.replace(/[^0-9.,\-]/g, "").replace(/\s/g, "");
  if (!cleaned) return null;
  // European decimal comma: a lone comma with 1-2 trailing digits and no
  // dot is a decimal separator, not a thousands separator.
  if (!cleaned.includes(".") && /^[^,]*,[0-9]{1,2}$/.test(cleaned)) {
    cleaned = cleaned.replace(",", ".");
  } else {
    cleaned = cleaned.replace(/,/g, "");
  }
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n;
}
