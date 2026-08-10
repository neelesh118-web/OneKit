import { describe, expect, it } from "vitest";
import {
  classifyField,
  fakePerson,
  mulberry32,
  valueForKind
} from "../src/core/fake-filler";

describe("fake filler", () => {
  it("is deterministic with a seed", () => {
    const a = fakePerson({ seed: 42 });
    const b = fakePerson({ seed: 42 });
    expect(a).toEqual(b);
    expect(fakePerson({ seed: 43 }).fullName).not.toBe(a.fullName);
  });

  it("produces coherent person data", () => {
    const p = fakePerson({ seed: 7 });
    expect(p.fullName).toBe(`${p.firstName} ${p.lastName}`);
    expect(p.email).toContain(p.firstName.toLowerCase());
    expect(p.phone).toMatch(/\(\d{3}\)/);
    expect(p.zip).toMatch(/^\d{5}$/);
    expect(p.creditCard).toMatch(/^\d{4}-\d{4}-\d{4}-\d{4}$/);
  });

  it("classifies fields by name/id/placeholder/autocomplete", () => {
    expect(classifyField({ name: "email" })).toBe("email");
    expect(classifyField({ name: "phone", id: "tel1" })).toBe("phone");
    expect(classifyField({ placeholder: "Card number" })).toBe("cc");
    expect(classifyField({ name: "zipcode" })).toBe("zip");
    expect(classifyField({ name: "state" })).toBe("state");
    expect(classifyField({ name: "first_name" })).toBe("name");
    expect(classifyField({ name: "company" })).toBe("company");
    expect(classifyField({ autocomplete: "username" })).toBe("username");
    expect(classifyField({ type: "password" })).toBe("password");
    expect(classifyField({ name: "anything_else" })).toBe("generic");
  });

  it("returns values that match the field kind", () => {
    const p = fakePerson({ seed: 1 });
    expect(valueForKind("email", p)).toContain("@");
    expect(valueForKind("phone", p)).toMatch(/\d/);
    expect(valueForKind("cc", p)).toMatch(/^\d{4}-\d{4}-\d{4}-\d{4}$/);
    expect(valueForKind("password", p)).toBe(p.password);
  });

  it("mulberry32 is a stable PRNG", () => {
    const rng = mulberry32(123);
    const first = [rng(), rng(), rng()];
    const again = mulberry32(123);
    expect([again(), again(), again()]).toEqual(first);
  });
});
