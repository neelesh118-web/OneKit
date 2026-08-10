/**
 * Distraction-blocker overlay — a shadow-DOM full-page overlay that hides a
 * distracting site during a blocked window. Shadow DOM keeps it immune to
 * the page's own CSS. It is never a trap: pausing for 10 minutes, allowing
 * the site for today, and opening settings are always one click away.
 */

export interface FocusOverlayActions {
  /** User wants to pause blocking for 10 minutes. */
  onPause(): void;
  /** User wants to allow this hostname for the rest of today. */
  onAllowToday(): void;
}

export interface FocusOverlayHandle {
  /** Removes the overlay from the DOM (idempotent). */
  dismiss(): void;
  /** True while the overlay is still attached. */
  isVisible(): boolean;
}

const STYLE = `
:host { all: initial; }
.overlay {
  position: fixed; inset: 0; z-index: 2147483647;
  display: flex; align-items: center; justify-content: center;
  background: #0f172a; color: #e2e8f0;
  font: 15px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.card {
  max-width: 420px; margin: 24px; padding: 28px;
  background: #1e293b; border-radius: 14px;
  box-shadow: 0 12px 40px rgba(0,0,0,.45);
}
h1 { margin: 0 0 8px; font-size: 20px; color: #f8fafc; }
p { margin: 0 0 18px; color: #cbd5e1; }
.buttons { display: flex; flex-wrap: wrap; gap: 10px; }
button {
  border: none; border-radius: 8px; padding: 10px 14px;
  font: 600 14px/1 system-ui, sans-serif; cursor: pointer;
}
.primary { background: #4f46e5; color: #fff; }
.ghost { background: #334155; color: #e2e8f0; }
.hint { margin-top: 14px; font-size: 12px; color: #94a3b8; }
`;

export interface FocusOverlayOptions {
  /** Why the site is covered — schedule window or daily budget. */
  reason?: "schedule" | "budget";
}

/** Creates and mounts the blocking overlay. Returns a handle to dismiss it. */
export function createFocusOverlay(
  hostname: string,
  actions: FocusOverlayActions,
  options: FocusOverlayOptions = {}
): FocusOverlayHandle {
  let host = document.getElementById("onekit-focus-overlay");
  if (!host) {
    host = document.createElement("div");
    host.id = "onekit-focus-overlay";
    document.documentElement.appendChild(host);
  }
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  shadow.innerHTML = "";

  const style = document.createElement("style");
  style.textContent = STYLE;

  const overlay = document.createElement("div");
  overlay.className = "overlay";

  const card = document.createElement("div");
  card.className = "card";

  const title = document.createElement("h1");
  title.textContent = `Time for a break from ${hostname}`;

  const body = document.createElement("p");
  body.textContent =
    options.reason === "budget"
      ? "You've hit your daily time budget for this site — OneKit is covering it until tomorrow. Everything is local; this is just the limit you set."
      : "OneKit's distraction blocker is covering this site right now. Everything is local — no one is watching; this is just your schedule.";

  const buttons = document.createElement("div");
  buttons.className = "buttons";

  const pauseBtn = document.createElement("button");
  pauseBtn.className = "primary";
  pauseBtn.type = "button";
  pauseBtn.textContent = "Pause for 10 minutes";
  pauseBtn.addEventListener("click", () => {
    actions.onPause();
    dismiss();
  });

  const allowBtn = document.createElement("button");
  allowBtn.className = "ghost";
  allowBtn.type = "button";
  allowBtn.textContent = "Allow for today";
  allowBtn.addEventListener("click", () => {
    actions.onAllowToday();
    dismiss();
  });

  const hint = document.createElement("div");
  hint.className = "hint";
  hint.textContent =
    "To change or remove this schedule, open the OneKit extension → Focus tab.";

  buttons.append(pauseBtn, allowBtn);
  card.append(title, body, buttons, hint);
  overlay.appendChild(card);
  shadow.append(style, overlay);

  function dismiss(): void {
    host?.remove();
  }

  return {
    dismiss,
    isVisible: () => !!document.getElementById("onekit-focus-overlay")
  };
}
