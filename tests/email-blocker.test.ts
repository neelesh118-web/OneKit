// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { looksLikeEmailField, looksLikeSignupForm } from "../src/core/email-blocker";

function form(html: string): HTMLFormElement {
  const form = document.createElement("form");
  form.innerHTML = html;
  document.body.appendChild(form);
  return form;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("looksLikeEmailField", () => {
  it("detects type=email", () => {
    const input = document.createElement("input");
    input.type = "email";
    expect(looksLikeEmailField(input)).toBe(true);
  });
  it("detects email-ish names and ids", () => {
    const a = document.createElement("input");
    a.name = "email_address";
    expect(looksLikeEmailField(a)).toBe(true);
    const b = document.createElement("input");
    b.id = "newsletter-email";
    expect(looksLikeEmailField(b)).toBe(true);
  });
  it("ignores plain text fields", () => {
    const input = document.createElement("input");
    input.type = "text";
    input.name = "username";
    expect(looksLikeEmailField(input)).toBe(false);
  });
});

describe("looksLikeSignupForm", () => {
  it("detects a newsletter form", () => {
    const f = form(`
      <p>Subscribe to our newsletter</p>
      <input type="email" name="email" />
      <button type="submit">Subscribe</button>
    `);
    expect(looksLikeSignupForm(f)).toBe(true);
  });
  it("detects a sign-up form", () => {
    const f = form(`
      <input type="email" name="mail" />
      <button type="submit">Sign up for updates</button>
    `);
    expect(looksLikeSignupForm(f)).toBe(true);
  });
  it("ignores login forms", () => {
    const f = form(`
      <p>Log in to your account</p>
      <input type="email" name="email" />
      <button type="submit">Log in</button>
    `);
    expect(looksLikeSignupForm(f)).toBe(false);
  });
  it("ignores forms without an email field", () => {
    const f = form(`
      <p>Subscribe to our newsletter</p>
      <input type="text" name="name" />
      <button type="submit">Subscribe</button>
    `);
    expect(looksLikeSignupForm(f)).toBe(false);
  });
});
