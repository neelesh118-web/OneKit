// @vitest-environment node
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync, zipSync } from "fflate/browser";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { htmlToPptx } from "../src/core/converter/documents";
import { targetsFor } from "../src/core/converter/matrix";

function canvasOptions(): ConvertOptions {
  let width = 1, height = 1;
  const context = { translate(): void {}, rotate(): void {}, scale(): void {}, drawImage(): void {},
    getImageData: () => ({ width, height, data: new Uint8ClampedArray(width * height * 4), colorSpace: "srgb" }) as ImageData };
  return { canvas: { canvasFactory: () => ({ get width(){return width;}, set width(v){width=v;}, get height(){return height;}, set height(v){height=v;}, getContext:()=>context,
    toBlob(callback: (blob: Blob | null) => void, mime?: string): void { callback(new Blob([mime === "image/webp" ? new TextEncoder().encode("RIFF0000WEBP") : new Uint8Array([0x89,0x50,0x4e,0x47])], { type: mime ?? "image/png" })); }
  }) as unknown as HTMLCanvasElement, decode: async()=>({width:10,height:10,close():void{}}) as unknown as ImageBitmap } };
}

describe("round 2: POTX and PPSX image outputs", () => {
  it("advertises ranks 3397/3401/3403 and 3418/3422/3424", () => {
    for (const source of ["potx", "ppsx"] as const) expect(targetsFor(source)).toEqual(expect.arrayContaining(["image-gif","image-svg","image-webp"]));
  });
  const base = htmlToPptx("<h1>Local presentation</h1><p>Readable slide.</p>");
  const variant = (contentType: string): Uint8Array => { const files=unzipSync(base); files["[Content_Types].xml"]=new TextEncoder().encode(strFromU8(files["[Content_Types].xml"]!).replace("application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",contentType)); return zipSync(files); };
  const sources = [["potx", variant("application/vnd.openxmlformats-officedocument.presentationml.template.main+xml"), "template.potx"], ["ppsx", variant("application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml"), "show.ppsx"]] as const;
  const targets = [["image-gif","gif","image/gif","GIF89a"],["image-svg","svg","image/svg+xml","<svg"],["image-webp","webp","image/webp","RIFF"]] as const;
  for (const [source, bytes, name] of sources) for (const [target, ext, mime, signature] of targets) {
    it(`${source} converts to ${target}`, async () => {
      const result = await convertFile({bytes,name},target,canvasOptions());
      expect(result).toMatchObject({name:`${source === "potx" ? "template" : "show"}.${ext}`,mime});
      expect(new TextDecoder().decode(result.bytes.slice(0,100))).toContain(signature);
    });
  }
  it("rejects corrupt POTX and PPSX", async () => {
    const bad = new Uint8Array([0x50,0x4b,0x03,0x04,1]);
    await expect(convertFile({bytes:bad,name:"bad.potx"},"image-svg")).rejects.toThrow();
    await expect(convertFile({bytes:bad,name:"bad.ppsx"},"image-webp",canvasOptions())).rejects.toThrow();
  });
});
