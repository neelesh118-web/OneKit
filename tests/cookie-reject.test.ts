import { describe, expect, it } from "vitest";
import { classifyButtonText, findRejectButton } from "../src/core/cookie-reject";

describe("cookie-reject", () => {
  it("classifies reject/accept/manage intents", () => {
    expect(classifyButtonText("Reject all")).toBe("reject");
    expect(classifyButtonText("DECLINE")).toBe("reject");
    expect(classifyButtonText("Only necessary")).toBe("reject");
    expect(classifyButtonText("Accept all")).toBe("accept");
    expect(classifyButtonText("Manage preferences")).toBe("manage");
    expect(classifyButtonText("Read more")).toBe("none");
  });

  it("finds a reject button inside a banner container", () => {
    document.body.innerHTML = `
      <div id="consent-banner">
        <button id="accept">Accept all</button>
        <button id="reject">Reject</button>
      </div>
    `;
    const button = findRejectButton(document);
    expect(button?.id).toBe("reject");
  });

  it("prefers the strong reject-all button", () => {
    document.body.innerHTML = `
      <div class="cookie-notice">
        <button>Reject</button>
        <button>Reject all</button>
      </div>
    `;
    const button = findRejectButton(document);
    expect(button?.textContent?.trim()).toBe("Reject all");
  });

  it("refuses to click a plain page-content button that says reject", () => {
    document.body.innerHTML = `
      <article>
        <p>Terms: you may <button>Reject</button> the proposal.</p>
      </article>
    `;
    expect(findRejectButton(document)).toBeNull();
  });

  it("returns null when only accept exists", () => {
    document.body.innerHTML = `
      <div id="cookie-banner">
        <button>Accept all</button>
      </div>
    `;
    expect(findRejectButton(document)).toBeNull();
  });
});
