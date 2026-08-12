// @vitest-environment node
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync, zipSync } from "fflate/browser";
import { convertFile } from "../src/core/converter/convert";
import { htmlToPptm, htmlToPptx } from "../src/core/converter/documents";
import { targetsFor } from "../src/core/converter/matrix";

function variantPptx(contentType: string): Uint8Array {
  const files = unzipSync(htmlToPptx("<h1>Local plan</h1><p>Ship safely.</p>"));
  files["[Content_Types].xml"] = new TextEncoder().encode(strFromU8(files["[Content_Types].xml"]!).replace(
    "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml", contentType
  ));
  return zipSync(files);
}

describe("round 2: presentation variants to ODP", () => {
  it("advertises POTX, PPSX, and PPTM to ODP", () => {
    for (const source of ["potx", "ppsx", "pptm"] as const) expect(targetsFor(source)).toContain("odp");
  });

  const sources = [
    ["potx", "template.potx", variantPptx("application/vnd.openxmlformats-officedocument.presentationml.template.main+xml")],
    ["ppsx", "show.ppsx", variantPptx("application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml")],
    ["pptm", "macro-enabled.pptm", htmlToPptm("<h1>Local plan</h1><p>Ship safely.</p>")]
  ] as const;

  it.each(sources)("converts %s slide data to a genuine ODP package", async (_source, name, bytes) => {
    const result = await convertFile({ bytes, name }, "odp");
    expect(result).toMatchObject({ name: `${name.replace(/\.[^.]+$/, "")}.odp`, mime: "application/vnd.oasis.opendocument.presentation" });
    const files = unzipSync(result.bytes);
    expect(strFromU8(files.mimetype!)).toBe("application/vnd.oasis.opendocument.presentation");
    const content = strFromU8(files["content.xml"]!);
    expect(content).toContain("Local plan");
    expect(content).toContain("Ship safely.");
  });

  it.each(["potx", "ppsx", "pptm"] as const)("rejects corrupt %s input", async (source) => {
    await expect(convertFile({ bytes: new Uint8Array([0x50, 0x4b, 3, 4, 1]), name: `bad.${source}` }, "odp")).rejects.toThrow();
  });
});
