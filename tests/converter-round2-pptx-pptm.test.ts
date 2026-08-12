// @vitest-environment node
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate/browser";
import { convertFile } from "../src/core/converter/convert";
import { htmlToPptx } from "../src/core/converter/documents";
import { pptxToSlides } from "../src/core/converter/pptx";
import { targetsFor } from "../src/core/converter/matrix";

describe("round 2 rank 3445: PPTX to PPTM", () => {
  it("advertises the pair", () => expect(targetsFor("pptx")).toContain("pptm"));
  it("writes genuine macro-enabled presentation OOXML without invented VBA", async () => {
    const input = htmlToPptx("<h1>Local deck</h1><p>Readable slide.</p>");
    const result = await convertFile({bytes:input,name:"deck.pptx"},"pptm");
    expect(result).toMatchObject({name:"deck.pptm",mime:"application/vnd.ms-powerpoint.presentation.macroEnabled.12"});
    const files=unzipSync(result.bytes);
    expect(strFromU8(files["[Content_Types].xml"]!)).toContain("application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml");
    expect(files["ppt/vbaProject.bin"]).toBeUndefined();
    const text=pptxToSlides(result.bytes).flatMap(s=>[s.title,...s.lines]).join(" ");
    expect(text).toContain("Local deck"); expect(text).toContain("Readable slide.");
  });
  it("rejects corrupt PPTX", async()=>{
    await expect(convertFile({bytes:new Uint8Array([0x50,0x4b,3,4,1]),name:"bad.pptx"},"pptm")).rejects.toThrow();
  });
});
