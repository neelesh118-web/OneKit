import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "../src/core/storage-utils";
import {
  addHidden,
  clearHiddenForHost,
  hiddenForHost,
  hideRuleFor,
  labelFor,
  listHidden,
  removeHidden,
  selectorFor
} from "../src/core/element-hider";

describe("element hider", () => {
  it("adds and lists hidden elements per hostname", async () => {
    const storage = createMemoryStorage();
    await addHidden(storage, { hostname: "example.com", selector: "#ads", label: "div — \"ads\"" }, 1000);
    await addHidden(storage, { hostname: "example.com", selector: ".popup", label: "div — popup" }, 2000);
    await addHidden(storage, { hostname: "other.org", selector: "h1", label: "h1" }, 3000);

    expect(await hiddenForHost(storage, "example.com")).toHaveLength(2);
    expect(await listHidden(storage)).toHaveLength(3);
    expect(await hiddenForHost(storage, "missing.com")).toHaveLength(0);
  });

  it("dedupes identical hostname+selector", async () => {
    const storage = createMemoryStorage();
    await addHidden(storage, { hostname: "example.com", selector: "#ads", label: "old" }, 1000);
    await addHidden(storage, { hostname: "example.com", selector: "#ads", label: "new" }, 2000);
    const list = await listHidden(storage);
    expect(list).toHaveLength(1);
    expect(list[0]!.label).toBe("new");
  });

  it("removes single entries and clears whole hosts", async () => {
    const storage = createMemoryStorage();
    await addHidden(storage, { hostname: "example.com", selector: "#a", label: "a" }, 1);
    await addHidden(storage, { hostname: "example.com", selector: "#b", label: "b" }, 2);
    expect(await removeHidden(storage, "example.com", "#a")).toBe(true);
    expect(await removeHidden(storage, "example.com", "#a")).toBe(false);
    expect(await hiddenForHost(storage, "example.com")).toHaveLength(1);
    expect(await clearHiddenForHost(storage, "example.com")).toBe(1);
    expect(await listHidden(storage)).toHaveLength(0);
  });

  it("rejects empty hostname/selector", async () => {
    const storage = createMemoryStorage();
    await expect(addHidden(storage, { hostname: "", selector: "#a", label: "a" })).rejects.toThrow();
    await expect(addHidden(storage, { hostname: "x.com", selector: "  ", label: "a" })).rejects.toThrow();
  });

  it("builds hide rules and labels", () => {
    expect(hideRuleFor("#ads")).toBe("#ads { display: none !important; }");
    const el = document.createElement("h2");
    el.textContent = "We have a deal!";
    expect(labelFor(el)).toBe('h2 — "We have a deal!"');
  });

  it("builds stable selectors from ids, classes and position", () => {
    const parent = document.createElement("div");
    parent.id = "feed";
    const a = document.createElement("p");
    a.className = "promo blue";
    parent.appendChild(a);
    expect(selectorFor(a)).toBe("p.promo.blue");

    const idEl = document.createElement("section");
    idEl.id = "sidebar";
    expect(selectorFor(idEl)).toBe("#sidebar");

    const box = document.createElement("div");
    const first = document.createElement("span");
    const second = document.createElement("span");
    box.append(first, second);
    expect(selectorFor(second)).toBe("div > span:nth-of-type(2)");
  });
});
