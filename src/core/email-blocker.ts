/**
 * Email-signup blocker — the dark-pattern fight, done honestly.
 * When a form on the page looks like a newsletter signup (an email field +
 * a subscribe-style button), OneKit intercepts the submit and asks the user
 * to confirm before anything is sent. It never auto-submits anything, never
 * fabricates an email, and stays completely local.
 */

const SIGNUP_HINTS = [
  "subscribe", "newsletter", "sign up", "signup", "sign-up", "join our",
  "join the", "mailing list", "email list", "get updates", "get the latest",
  "stay in the loop", "keep me posted", "free newsletter", "weekly digest"
];

const BUTTON_HINTS = ["subscribe", "sign up", "signup", "join", "submit", "get updates", "notify me"];

export function looksLikeEmailField(input: HTMLInputElement): boolean {
  const type = (input.type || "").toLowerCase();
  const name = (input.name || "").toLowerCase();
  const id = (input.id || "").toLowerCase();
  const placeholder = (input.placeholder || "").toLowerCase();
  const autocomplete = (input.autocomplete || "").toLowerCase();
  if (type === "email") return true;
  return /email|mail/.test(name) || /email|mail/.test(id) || /email|mail/.test(placeholder) || autocomplete === "email";
}

export function looksLikeSignupForm(form: HTMLFormElement): boolean {
  const text = form.textContent?.toLowerCase() ?? "";
  if (!SIGNUP_HINTS.some((h) => text.includes(h))) return false;
  const hasEmail = [...form.querySelectorAll<HTMLInputElement>("input")].some(looksLikeEmailField);
  if (!hasEmail) return false;
  const hasButton = [...form.querySelectorAll<HTMLElement>("button, input[type=submit], input[type=button]")].some(
    (b) => {
      const label = ((b as HTMLButtonElement).value || b.textContent || "").toLowerCase();
      return BUTTON_HINTS.some((h) => label.includes(h));
    }
  );
  return hasButton;
}

/** Simple in-page confirmation gate: returns true when the user consents. */
export function confirmSignup(dialogText: string): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText = [
      "position:fixed", "inset:0", "z-index:2147483647",
      "background:rgba(15,23,42,.9)", "display:flex", "align-items:center", "justify-content:center",
      "padding:20px", "font:14px/1.5 system-ui,sans-serif"
    ].join(";");

    const card = document.createElement("div");
    card.style.cssText = [
      "max-width:380px", "width:100%", "background:#fff", "color:#0f172a",
      "border-radius:12px", "padding:18px 20px", "box-shadow:0 18px 50px rgba(0,0,0,.45)"
    ].join(";");

    const title = document.createElement("strong");
    title.textContent = "OneKit — newsletter signup detected";
    title.style.display = "block";
    title.style.marginBottom = "8px";

    const body = document.createElement("p");
    body.textContent = dialogText;
    body.style.margin = "0 0 14px";
    body.style.color = "#334155";

    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;justify-content:flex-end";

    const skipBtn = document.createElement("button");
    skipBtn.type = "button";
    skipBtn.textContent = "✕ Skip signup";
    skipBtn.style.cssText = "padding:7px 12px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;cursor:pointer;color:#0f172a";

    const proceedBtn = document.createElement("button");
    proceedBtn.type = "button";
    proceedBtn.textContent = "Yes, subscribe";
    proceedBtn.style.cssText = "padding:7px 12px;border-radius:8px;border:none;background:#2563eb;color:#fff;cursor:pointer";

    row.append(skipBtn, proceedBtn);
    card.append(title, body, row);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const close = (result: boolean): void => {
      overlay.remove();
      resolve(result);
    };
    skipBtn.addEventListener("click", () => close(false));
    proceedBtn.addEventListener("click", () => close(true));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(false);
    });
  });
}
