import { describe, expect, it } from "vitest";
import {
  applyExpansion,
  deleteSnippet,
  findExpansionAt,
  isValidAlias,
  listSnippets,
  normalizeAlias,
  saveSnippet,
  type Snippet
} from "../src/core/snippets";
import { createMemoryStorage } from "../src/core/storage-utils";

const storage = () => createMemoryStorage();
const snip = (alias: string, text: string, id = alias): Snippet => ({
  id,
  alias,
  text,
  created: 1
});

describe("snippets", () => {
  it("normalizes and validates aliases", () => {
    expect(normalizeAlias(";Addr")).toBe("addr");
    expect(isValidAlias("addr")).toBe(true);
    expect(isValidAlias("my-addr_2")).toBe(true);
    expect(isValidAlias("")).toBe(false);
    expect(isValidAlias("with space")).toBe(false);
    expect(isValidAlias("a".repeat(30))).toBe(false);
  });

  it("saves, updates, and lists snippets", async () => {
    const s = storage();
    const created = await saveSnippet(s, ";addr", "1 Main Street, London", 10);
    expect(created.ok).toBe(true);
    const updated = await saveSnippet(s, "addr", "2 Main Street, London", 20);
    expect(updated.ok).toBe(true);
    const list = await listSnippets(s);
    expect(list).toHaveLength(1);
    expect(list[0]?.text).toBe("2 Main Street, London");
  });

  it("rejects invalid snippets with honest errors", async () => {
    const s = storage();
    expect((await saveSnippet(s, "bad alias!", "x")).ok).toBe(false);
    expect((await saveSnippet(s, "ok", "   ")).ok).toBe(false);
  });

  it("finds an expansion after a ; prefix at the end of text", () => {
    const snippets = [snip("addr", "1 Main Street")];
    const match = findExpansionAt("My address is ;addr", snippets);
    expect(match).not.toBeNull();
    expect(match?.start).toBe(14); // the ";"
    expect(match?.end).toBe(19); // after "addr"
    expect(match?.alias).toBe("addr");
  });

  it("never expands a plain word without the ; prefix", () => {
    const snippets = [snip("mail", "email me"), snip("addr", "1 Main Street")];
    expect(findExpansionAt("myemail", snippets)).toBeNull();
    expect(findExpansionAt("send mail", snippets)).toBeNull();
    expect(findExpansionAt("the address", snippets)).toBeNull();
    expect(findExpansionAt(";mail", snippets)).not.toBeNull();
  });

  it("does not match a partial alias inside a longer ;-word", () => {
    const snippets = [snip("mail", "email me")];
    expect(findExpansionAt(";myemail", snippets)).toBeNull();
  });

  it("applies the expansion, consumes the ;, and moves the caret", () => {
    const snippets = [snip("addr", "1 Main Street")];
    const match = findExpansionAt("Hi ;addr", snippets)!;
    const { text, caret } = applyExpansion("Hi ;addr", match, " ");
    expect(text).toBe("Hi 1 Main Street ");
    expect(text).not.toContain(";");
    expect(caret).toBe("Hi 1 Main Street ".length);
  });

  it("deletes snippets", async () => {
    const s = storage();
    const created = await saveSnippet(s, "tmp", "x", 1);
    await deleteSnippet(s, created.snippet!.id);
    expect(await listSnippets(s)).toHaveLength(0);
  });
});
