import { afterEach, describe, expect, it, vi } from "vitest";
import { fillTargets, findCredentialFields, setNativeValue } from "../src/core/vault-fill";

afterEach(() => {
  document.body.innerHTML = "";
});

function loginForm(): HTMLFormElement {
  const form = document.createElement("form");
  form.innerHTML = `
    <input id="user" type="text" placeholder="Username" />
    <input id="pass" type="password" placeholder="Password" />
  `;
  document.body.appendChild(form);
  return form;
}

describe("findCredentialFields", () => {
  it("finds the username + password fields on a standard login form", () => {
    const form = loginForm();
    const { username, password } = findCredentialFields(form);
    expect(username?.id).toBe("user");
    expect(password?.id).toBe("pass");
  });

  it("prefers the last password field and the text field before it", () => {
    const form = document.createElement("form");
    form.innerHTML = `
      <input id="first" type="text" />
      <input id="pass1" type="password" />
      <input id="extra" type="text" />
      <input id="pass2" type="password" />
    `;
    document.body.appendChild(form);
    const { username, password } = findCredentialFields(form);
    expect(username?.id).toBe("extra"); // text input immediately before the last password
    expect(password?.id).toBe("pass2");
  });

  it("honours autocomplete=username over position", () => {
    const form = document.createElement("form");
    form.innerHTML = `
      <input id="unrelated" type="text" />
      <input id="user" type="text" autocomplete="username" />
      <input id="pass" type="password" />
    `;
    document.body.appendChild(form);
    expect(findCredentialFields(form).username?.id).toBe("user");
  });

  it("returns null targets when there is no password field", () => {
    const form = document.createElement("form");
    form.innerHTML = `<input type="text" />`;
    document.body.appendChild(form);
    expect(findCredentialFields(form).username).toBeNull();
    expect(findCredentialFields(form).password).toBeNull();
  });

  it("skips hidden, disabled and read-only fields", () => {
    const form = document.createElement("form");
    form.innerHTML = `
      <input id="hidden" type="hidden" />
      <input id="disabled" type="password" disabled />
      <input id="real" type="password" />
    `;
    document.body.appendChild(form);
    expect(findCredentialFields(form).password?.id).toBe("real");
  });
});

describe("setNativeValue + fillTargets", () => {
  it("sets the value through the native setter and fires input + change", () => {
    const input = document.createElement("input");
    const inputSpy = vi.fn();
    const changeSpy = vi.fn();
    input.addEventListener("input", inputSpy);
    input.addEventListener("change", changeSpy);
    setNativeValue(input, "alice");
    expect(input.value).toBe("alice");
    expect(inputSpy).toHaveBeenCalledTimes(1);
    expect(changeSpy).toHaveBeenCalledTimes(1);
  });

  it("fills both fields and reports the count honestly", () => {
    const form = loginForm();
    const targets = findCredentialFields(form);
    const filled = fillTargets(targets, "alice", "hunter2");
    expect(filled).toBe(2);
    expect((document.getElementById("user") as HTMLInputElement).value).toBe("alice");
    expect((document.getElementById("pass") as HTMLInputElement).value).toBe("hunter2");
  });

  it("fills only what exists (empty username → 1 field)", () => {
    const form = loginForm();
    const targets = findCredentialFields(form);
    expect(fillTargets(targets, "", "hunter2")).toBe(1);
    expect(fillTargets({ username: null, password: null }, "a", "b")).toBe(0);
  });
});
