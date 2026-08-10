import { describe, expect, it } from "vitest";
import {
  base64Decode,
  base64Encode,
  formatDate,
  formatJson,
  isBase64,
  minifyJson,
  sha256Hex,
  simpleDiff,
  testRegex,
  timestampToDate,
  toCamelCase,
  toKebabCase,
  toSnakeCase,
  toTitleCase,
  urlDecode,
  urlEncode
} from "../src/core/dev-tools";

describe("JSON tools", () => {
  it("formats and minifies JSON", () => {
    const formatted = formatJson('{"a":1,"b":[1,2]}');
    expect(formatted.ok).toBe(true);
    expect(formatted.ok && formatted.value).toContain('"a": 1');
    const minified = minifyJson('{ "a": 1 }');
    expect(minified.ok && minified.value).toBe('{"a":1}');
  });

  it("reports invalid JSON honestly", () => {
    expect(formatJson("{nope").ok).toBe(false);
    expect(minifyJson("").ok).toBe(false);
  });
});

describe("Base64", () => {
  it("encodes and decodes unicode text round-trip", () => {
    const text = "Hello, 世界! 🔒";
    const encoded = base64Encode(text);
    expect(isBase64(encoded)).toBe(true);
    const decoded = base64Decode(encoded);
    expect(decoded.ok && decoded.value).toBe(text);
  });

  it("rejects malformed input", () => {
    expect(isBase64("not base64!!!")).toBe(false);
    expect(isBase64("AAAA")).toBe(true);
    expect(base64Decode("!!!").ok).toBe(false);
  });
});

describe("URL encoding", () => {
  it("encodes and decodes", () => {
    expect(urlEncode("a b&c=d")).toBe("a%20b%26c%3Dd");
    const decoded = urlDecode("a%20b%26c%3Dd");
    expect(decoded.ok && decoded.value).toBe("a b&c=d");
    expect(urlDecode("%zz").ok).toBe(false);
  });
});

describe("case conversion", () => {
  it("converts between cases", () => {
    expect(toTitleCase("hello WORLD")).toBe("Hello World");
    expect(toCamelCase("hello world foo")).toBe("helloWorldFoo");
    expect(toSnakeCase("Hello World")).toBe("hello_world");
    expect(toKebabCase("Hello World")).toBe("hello-world");
  });
});

describe("sha256", () => {
  it("hashes locally (known vectors)", async () => {
    expect(await sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("timestamps", () => {
  it("auto-detects seconds vs milliseconds", () => {
    expect(timestampToDate("1700000000")?.toISOString()).toBe("2023-11-14T22:13:20.000Z");
    expect(timestampToDate("1700000000000")?.toISOString()).toBe("2023-11-14T22:13:20.000Z");
    expect(timestampToDate("not a number")).toBeNull();
  });

  it("formats dates readably", () => {
    expect(formatDate(new Date("2023-11-14T22:13:20.000Z"))).toBe("2023-11-14 22:13:20 UTC");
  });
});

describe("regex tester", () => {
  it("finds matches and reports errors", () => {
    const result = testRegex("\\d+", "g", "a1 b22 c333");
    expect(result.ok && result.value.matches).toEqual(["1", "22", "333"]);
    expect(result.ok && result.value.matchCount).toBe(3);
    expect(testRegex("(", "g", "x").ok).toBe(false);
  });
});

describe("simpleDiff", () => {
  it("diffs line by line", () => {
    const diff = simpleDiff("a\nb\nc", "a\nx\nc");
    expect(diff.filter((l) => l.type === "same").map((l) => l.line)).toEqual(["a", "c"]);
    expect(diff.find((l) => l.type === "remove")?.line).toBe("b");
    expect(diff.find((l) => l.type === "add")?.line).toBe("x");
  });

  it("handles identical and empty inputs", () => {
    expect(simpleDiff("a\nb", "a\nb").every((l) => l.type === "same")).toBe(true);
    // "".split("\n") is [""] — one identical empty line is the honest result.
    expect(simpleDiff("", "")).toEqual([{ type: "same", line: "" }]);
  });
});
