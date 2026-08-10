import { loadSettings } from "../src/core/settings";
import { confirmSignup, looksLikeSignupForm } from "../src/core/email-blocker";

/**
 * Email-signup blocker — a content script that intercepts newsletter-style
 * form submissions and asks the user to confirm before anything is sent.
 * Gated by Settings → Tools → "Confirm before newsletter/signup forms
 * submit". Completely local; never fabricates an email.
 */
export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  main() {
    void (async () => {
      const settings = await loadSettings();
      if (!settings.tools.emailBlocker) return;

      document.addEventListener(
        "submit",
        (event) => {
          const form = event.target;
          if (!(form instanceof HTMLFormElement)) return;
          if ((form as HTMLFormElement & { _onekitBypass?: boolean })._onekitBypass) return;
          if (!looksLikeSignupForm(form)) return;

          event.preventDefault();
          void confirmSignup(
            `This looks like a newsletter signup form. OneKit caught it before anything was sent — do you actually want to subscribe?`
          ).then((proceed) => {
            if (proceed) {
              // Re-dispatch so the user's choice wins; the submit listener
              // will match again, so bypass the gate this once.
              (form as HTMLFormElement & { _onekitBypass?: boolean })._onekitBypass = true;
              form.requestSubmit();
            }
          });
        },
        true
      );
    })();
  }
});
