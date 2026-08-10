// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildApiRequest, formatApiResponse, parseHeaderLines } from "../src/core/api-tester";

describe("parseHeaderLines", () => {
  it("parses Name: value lines and ignores junk", () => {
    const h = parseHeaderLines("Content-Type: application/json\nX-Token: abc\n\nnot-a-header");
    expect(h["content-type"]).toBe("application/json");
    expect(h["x-token"]).toBe("abc");
    expect(Object.keys(h).length).toBe(2);
  });
});

describe("buildApiRequest", () => {
  it("builds a valid POST with JSON body and auto content-type", () => {
    const r = buildApiRequest({
      method: "POST",
      url: "https://api.example.com/items",
      headersText: "Accept: application/json",
      bodyText: '{"name":"test"}'
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.init.method).toBe("POST");
    expect(r.init.body).toBe('{"name":"test"}');
    const headers = r.init.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["accept"]).toBe("application/json");
  });

  it("rejects GET with a body", () => {
    const r = buildApiRequest({
      method: "GET",
      url: "https://api.example.com/items",
      headersText: "",
      bodyText: '{"a":1}'
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/can't carry a body/);
  });

  it("rejects malformed JSON bodies", () => {
    const r = buildApiRequest({
      method: "POST",
      url: "https://api.example.com/items",
      headersText: "",
      bodyText: "{broken"
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/doesn't parse/);
  });

  it("rejects invalid and non-http URLs", () => {
    const bad = buildApiRequest({ method: "GET", url: "not a url", headersText: "", bodyText: "" });
    expect(bad.ok).toBe(false);
    const ftp = buildApiRequest({ method: "GET", url: "ftp://example.com/x", headersText: "", bodyText: "" });
    expect(ftp.ok).toBe(false);
  });
});

describe("formatApiResponse", () => {
  it("reports status, timing and a truncated body", () => {
    const out = formatApiResponse(200, "OK", 42, "hello world");
    expect(out).toContain("200 OK · 42 ms");
    expect(out).toContain("hello world");
    const long = formatApiResponse(500, "Server Error", 999, "x".repeat(3000));
    expect(long).toContain("500 Server Error");
    expect(long).toContain("truncated");
  });
});
