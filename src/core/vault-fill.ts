/**
 * Vault fill — finds login fields and sets their values so framework
 * (React/Vue) forms register the change. Pure DOM logic, testable in jsdom.
 *
 * Deliberate honesty: we fill the *first* username field and the *last*
 * password field, and never submit. The controller's toast says "check the
 * fields before submitting" — a mis-fill is possible on unusual forms, and
 * we say so rather than pretending otherwise.
 */

export interface FillTargets {
  username: HTMLInputElement | null;
  password: HTMLInputElement | null;
}

function isFillable(input: HTMLInputElement): boolean {
  if (input.disabled || input.readOnly) return false;
  const type = (input.type || "text").toLowerCase();
  return type !== "hidden" && type !== "submit" && type !== "button" && type !== "reset";
}

/** The strongest username-field heuristic, in priority order. */
export function findCredentialFields(root: ParentNode): FillTargets {
  const inputs = Array.from(root.querySelectorAll<HTMLInputElement>("input"));
  const fillable = inputs.filter(isFillable);
  const passwords = fillable.filter((i) => i.type === "password");
  const password = passwords.length > 0 ? passwords[passwords.length - 1]! : null;

  let username: HTMLInputElement | null = null;
  if (password) {
    const passwordIndex = inputs.indexOf(password);
    // 1. Explicit autocomplete on any fillable input.
    username =
      fillable.find((i) => i !== password && (i.autocomplete === "username" || i.autocomplete === "email")) ?? null;
    // 2. A text/email input immediately before the password field.
    if (!username) {
      for (let i = passwordIndex - 1; i >= 0; i--) {
        const candidate = inputs[i]!;
        if (!isFillable(candidate)) continue;
        if (candidate.type === "password") continue;
        username = candidate;
        break;
      }
    }
    // 3. Name/id hints.
    if (!username) {
      username =
        fillable.find(
          (i) =>
            i !== password &&
            /^(user|login|email|mail|account)[-_]/i.test(i.name + " " + i.id + " " + i.autocomplete)
        ) ?? null;
    }
  }
  return { username, password };
}

/** Sets a value through the native setter so frameworks see the change,
 * then fires input + change events. */
export function setNativeValue(input: HTMLInputElement, value: string): void {
  const proto =
    input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) {
    setter.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Fills both fields when present; returns how many were filled. */
export function fillTargets(targets: FillTargets, username: string, password: string): number {
  let filled = 0;
  if (targets.username && username) {
    setNativeValue(targets.username, username);
    filled += 1;
  }
  if (targets.password && password) {
    setNativeValue(targets.password, password);
    filled += 1;
  }
  return filled;
}
