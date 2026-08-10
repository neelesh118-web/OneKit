import { describe, expect, it } from "vitest";
import {
  clearContactCard,
  EMPTY_CONTACT_CARD,
  fieldTokens,
  hasCardData,
  isFieldEmpty,
  matchField,
  readContactCard,
  saveContactCard
} from "../src/core/autofill";
import { createMemoryStorage } from "../src/core/storage-utils";

const storage = () => createMemoryStorage();

describe("autofill", () => {
  it("saves and reads the contact card", async () => {
    const s = storage();
    await saveContactCard(s, {
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+1 555 0100",
      address: "1 Analytical Engine Way",
      company: "Analytical Engines Ltd"
    });
    const card = await readContactCard(s);
    expect(card.name).toBe("Ada Lovelace");
    expect(card.company).toBe("Analytical Engines Ltd");
  });

  it("returns an empty card when nothing was saved", async () => {
    const card = await readContactCard(storage());
    expect(card).toEqual(EMPTY_CONTACT_CARD);
    expect(hasCardData(card)).toBe(false);
  });

  it("clears the card", async () => {
    const s = storage();
    await saveContactCard(s, { ...EMPTY_CONTACT_CARD, name: "X" });
    await clearContactCard(s);
    expect(await readContactCard(s)).toEqual(EMPTY_CONTACT_CARD);
  });

  it("hasCardData is true when any field is filled", () => {
    expect(hasCardData({ ...EMPTY_CONTACT_CARD, email: "a@b.c" })).toBe(true);
    expect(hasCardData({ ...EMPTY_CONTACT_CARD, phone: "  " })).toBe(false);
  });

  it("matches fields to card values by name/id/placeholder/type", () => {
    expect(matchField({ name: "email" })).toBe("email");
    expect(matchField({ type: "email" })).toBe("email");
    expect(matchField({ name: "phone" })).toBe("phone");
    expect(matchField({ placeholder: "Mobile number" })).toBe("phone");
    expect(matchField({ id: "street-address" })).toBe("address");
    expect(matchField({ name: "company" })).toBe("company");
    expect(matchField({ placeholder: "Your full name" })).toBe("name");
    expect(matchField({ name: "first_name" })).toBe("name");
    expect(matchField({ name: "password" })).toBeNull();
    expect(matchField({ name: "message" })).toBeNull();
    expect(matchField({ tagName: "select", name: "country" })).toBeNull();
  });

  it("fieldTokens lowercases and joins identifying text", () => {
    expect(fieldTokens({ name: "Email", placeholder: "you@x.com", type: "email" })).toBe(
      "email you@x.com email"
    );
  });

  it("isFieldEmpty treats whitespace as empty", () => {
    expect(isFieldEmpty({ value: "" })).toBe(true);
    expect(isFieldEmpty({ value: "   " })).toBe(true);
    expect(isFieldEmpty({ value: "hi" })).toBe(false);
  });
});
