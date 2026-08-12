// @vitest-environment node
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate/browser";
import { convertFile } from "../src/core/converter/convert";
import { buildOdp } from "../src/core/converter/odf";
import { targetsFor } from "../src/core/converter/matrix";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

function expectOdf(bytes: Uint8Array, mime: string, snippets: string[]): void {
  const files = unzipSync(bytes);
  expect(strFromU8(files.mimetype!)).toBe(mime);
  const content = strFromU8(files["content.xml"]!);
  for (const snippet of snippets) expect(content).toContain(snippet);
}

describe("round 2: ODF presentation/document lane", () => {
  it("advertises the demand-ranked pairs", () => {
    expect(targetsFor("markdown")).toContain("odp");
    expect(targetsFor("odp")).toContain("odt");
    expect(targetsFor("rtf")).toContain("odp");
  });

  it("converts Markdown to a genuine ODP package", async () => {
    const result = await convertFile({ bytes: encode("# Local roadmap\n\nShip the converter."), name: "roadmap.md" }, "odp");
    expect(result).toMatchObject({ name: "roadmap.odp", mime: "application/vnd.oasis.opendocument.presentation" });
    expectOdf(result.bytes, "application/vnd.oasis.opendocument.presentation", ["Local roadmap", "Ship the converter."]);
  });

  it("converts ODP slide text to a genuine ODT package", async () => {
    const source = buildOdp([{ title: "Quarterly review", lines: ["Revenue grew locally."] }]);
    const result = await convertFile({ bytes: source, name: "review.odp" }, "odt");
    expect(result).toMatchObject({ name: "review.odt", mime: "application/vnd.oasis.opendocument.text" });
    expectOdf(result.bytes, "application/vnd.oasis.opendocument.text", ["Quarterly review", "Revenue grew locally."]);
  });

  it("converts RTF to a genuine ODP package", async () => {
    const source = encode("{\\rtf1\\ansi\\b Team update\\b0\\par All work remains local.}");
    const result = await convertFile({ bytes: source, name: "update.rtf" }, "odp");
    expect(result).toMatchObject({ name: "update.odp", mime: "application/vnd.oasis.opendocument.presentation" });
    expectOdf(result.bytes, "application/vnd.oasis.opendocument.presentation", ["Team update", "All work remains local."]);
  });

  it("rejects blank prose and corrupt ODP rather than creating empty packages", async () => {
    await expect(convertFile({ bytes: encode(" \n"), name: "empty.md" }, "odp")).rejects.toThrow(/no readable text/i);
    await expect(convertFile({ bytes: encode("{\\rtf1\\ansi   }"), name: "empty.rtf" }, "odp")).rejects.toThrow(/no readable text/i);
    await expect(convertFile({ bytes: encode("not an ODF package"), name: "broken.odp" }, "odt")).rejects.toThrow();
  });
});
