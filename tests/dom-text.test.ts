import { describe, expect, it } from "vitest";
import {
  findFieldForDraft,
  rangeForCharOffsets,
  textBeforeCaretIn
} from "../src/core/dom-text";

describe("textBeforeCaretIn", () => {
  it("reads the text before the caret across nested nodes", () => {
    document.body.innerHTML =
      "<div id='ed' contenteditable='true'>hello <b>bold</b> world</div>";
    const ed = document.getElementById("ed")!;
    const textNode = ed.lastChild!; // " world"
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(textNode, 6); // end of " world"
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    expect(textBeforeCaretIn(ed)).toBe("hello bold world");
  });

  it("reads text up to a caret inside a nested element", () => {
    document.body.innerHTML =
      "<div id='ed' contenteditable='true'>hi <b>there</b></div>";
    const ed = document.getElementById("ed")!;
    const boldText = ed.querySelector("b")!.firstChild!;
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(boldText, 2); // inside "there"
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    expect(textBeforeCaretIn(ed)).toBe("hi th");
  });

  it("returns null when the caret is outside the element or not collapsed", () => {
    document.body.innerHTML =
      "<div id='a' contenteditable='true'>one</div><div id='b' contenteditable='true'>two</div>";
    const a = document.getElementById("a")!;
    const b = document.getElementById("b")!;
    const selection = window.getSelection()!;

    // Caret in b, asking about a → null.
    const inB = document.createRange();
    inB.selectNodeContents(b);
    inB.collapse(false);
    selection.removeAllRanges();
    selection.addRange(inB);
    expect(textBeforeCaretIn(a)).toBeNull();

    // Non-collapsed selection → null.
    const span = document.createRange();
    span.selectNodeContents(a);
    selection.removeAllRanges();
    selection.addRange(span);
    expect(textBeforeCaretIn(a)).toBeNull();
  });
});

describe("rangeForCharOffsets", () => {
  it("maps character offsets to a range across text nodes", () => {
    document.body.innerHTML = "<div id='c'>abc<b>def</b>ghi</div>";
    const c = document.getElementById("c")!;
    const range = rangeForCharOffsets(c, 2, 6); // "cdef"
    expect(range).not.toBeNull();
    expect(range!.startContainer).toBe(c.firstChild); // "abc"
    expect(range!.startOffset).toBe(2);
    expect(range!.endContainer).toBe(c.querySelector("b")!.firstChild); // "def"
    expect(range!.endOffset).toBe(3);
  });

  it("handles a collapsed range at a boundary", () => {
    document.body.innerHTML = "<div id='c'>abc</div>";
    const c = document.getElementById("c")!;
    const range = rangeForCharOffsets(c, 3, 3);
    expect(range).not.toBeNull();
    expect(range!.collapsed).toBe(true);
  });

  it("returns null for out-of-range or invalid offsets", () => {
    document.body.innerHTML = "<div id='c'>abc</div>";
    const c = document.getElementById("c")!;
    expect(rangeForCharOffsets(c, 0, 99)).toBeNull();
    expect(rangeForCharOffsets(c, -1, 2)).toBeNull();
    expect(rangeForCharOffsets(c, 5, 2)).toBeNull();
  });
});

describe("findFieldForDraft", () => {
  it("finds a field by name, then by id", () => {
    document.body.innerHTML =
      "<input name='q' id='x'><textarea name='notes' id='notes'></textarea>";
    const input = document.querySelector("input")!;
    const textarea = document.querySelector("textarea")!;
    expect(findFieldForDraft("q")).toBe(input);
    expect(findFieldForDraft("notes")).toBe(textarea);
    expect(findFieldForDraft("missing")).toBeNull();
  });

  it("escapes unusual identities safely", () => {
    document.body.innerHTML =
      "<input name='a\"b'><input name='a.b'></div>";
    expect(findFieldForDraft('a"b')).toBe(document.querySelector('[name="a\\"b"]'));
    expect(findFieldForDraft("a.b")).toBe(document.querySelector("[name='a.b']"));
  });
});
