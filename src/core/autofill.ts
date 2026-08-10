import { localStorageArea, type KvStorage } from "./storage-utils";

/**
 * Form autofill — one saved contact card (name, email, phone, address,
 * company) fills matching form fields. Matching is by field name/id/
 * placeholder/type heuristics; filling only ever happens on the user's
 * explicit click (never on load).
 */

export const CONTACT_CARD_KEY = "ok.contactCard";

export interface ContactCard {
  name: string;
  email: string;
  phone: string;
  address: string;
  company: string;
}

export const EMPTY_CONTACT_CARD: ContactCard = {
  name: "",
  email: "",
  phone: "",
  address: "",
  company: ""
};

export function isContactCard(value: unknown): value is ContactCard {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.name === "string" &&
    typeof v.email === "string" &&
    typeof v.phone === "string" &&
    typeof v.address === "string" &&
    typeof v.company === "string"
  );
}

export async function readContactCard(storage: KvStorage): Promise<ContactCard> {
  const raw = await storage.get(CONTACT_CARD_KEY);
  const value = raw[CONTACT_CARD_KEY];
  return isContactCard(value) ? value : { ...EMPTY_CONTACT_CARD };
}

export async function saveContactCard(storage: KvStorage, card: ContactCard): Promise<void> {
  await storage.set({ [CONTACT_CARD_KEY]: card });
}

export async function clearContactCard(storage: KvStorage): Promise<void> {
  await storage.remove(CONTACT_CARD_KEY);
}

export function hasCardData(card: ContactCard): boolean {
  return Object.values(card).some((v) => v.trim().length > 0);
}

export function localStorageContactCard(): KvStorage {
  return localStorageArea();
}

/** Keys a field's identifying text (name/id/placeholder/aria-label). */
export function fieldTokens(el: {
  name?: string;
  id?: string;
  placeholder?: string;
  ariaLabel?: string | null;
  type?: string;
}): string {
  return [el.name, el.id, el.placeholder, el.ariaLabel, el.type]
    .filter((t): t is string => !!t)
    .join(" ")
    .toLowerCase();
}

export type AutofillValue = keyof ContactCard;

/** Maps a form field to the contact-card value that fits it, or null. */
export function matchField(el: {
  name?: string;
  id?: string;
  placeholder?: string;
  ariaLabel?: string | null;
  type?: string;
  tagName?: string;
}): AutofillValue | null {
  const tokens = fieldTokens(el);
  const tag = (el.tagName ?? "").toLowerCase();
  if (tag === "select" || el.type === "select") return null;

  if (tokens.includes("email") || el.type === "email") return "email";
  if (tokens.includes("phone") || tokens.includes("tel") || tokens.includes("mobile")) return "phone";
  if (tokens.includes("address") || tokens.includes("street") || tokens.includes("addr")) return "address";
  if (tokens.includes("company") || tokens.includes("organization") || tokens.includes("employer")) return "company";
  if (
    tokens.includes("name") ||
    tokens.includes("fullname") ||
    tokens.includes("firstname") ||
    tokens.includes("lastname") ||
    tokens.includes("contact")
  ) return "name";
  return null;
}

/** True when a field already has a non-empty value (never overwrite silently). */
export function isFieldEmpty(el: { value?: string }): boolean {
  return !(el.value ?? "").trim();
}
