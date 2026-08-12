// @vitest-environment node
import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate/browser";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { detectFile } from "../src/core/converter/detect";
import { MATRIX, type TargetFormat } from "../src/core/converter/matrix";
import { rstToHtml, texToHtml } from "../src/core/converter/markup";

const enc = new TextEncoder();
const dec = new TextDecoder();
const imageOptions: ConvertOptions = {
  canvas: {
    canvasFactory: () => ({
      width: 1, height: 1,
      getContext: () => ({
        translate(): void {}, rotate(): void {}, scale(): void {}, drawImage(): void {},
        getImageData: () => ({ width: 1, height: 1, data: new Uint8ClampedArray(4), colorSpace: "srgb" }) as ImageData
      }),
      toBlob: (callback: (blob: Blob | null) => void, mime?: string) => callback(new Blob([new Uint8Array([1])], { type: mime ?? "application/octet-stream" }))
    }) as unknown as HTMLCanvasElement,
    decode: async () => ({ width: 1, height: 1, close(): void {} }) as unknown as ImageBitmap
  }
};
const rst = enc.encode(`Converter Roadmap\n=================\n\nLocal conversion keeps files private.\n\n- Parse real input\n- Verify **valid output**`);
const tex = enc.encode(String.raw`\documentclass{article}
\begin{document}
\section{Converter Roadmap}
Local conversion keeps files private.

\begin{itemize}
\item Parse real input
\item Verify valid output
\end{itemize}
\end{document}`);

function assertOutput(target: TargetFormat, bytes: Uint8Array): void {
  expect(bytes.length, `${target} output must not be empty`).toBeGreaterThan(0);
  if (target === "pdf") expect(dec.decode(bytes.subarray(0, 5))).toBe("%PDF-");
  if (["docx", "epub", "odt", "pptx"].includes(target)) {
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(Object.keys(unzipSync(bytes)).length).toBeGreaterThan(1);
  }
  if (target === "rtf") expect(dec.decode(bytes.subarray(0, 5))).toBe("{\\rtf");
}

describe("converter batch 3 - RST and TeX", () => {
  const fixtures = { rst, tex } as const;
  for (const source of ["rst", "tex"] as const) {
    it(`detects ${source} by its publishing-format extension`, () => {
      expect(detectFile(fixtures[source], `roadmap.${source}`).type).toBe(source);
    });
    for (const target of MATRIX[source]) {
      it(`${source} -> ${target} produces a real output`, async () => {
        const result = await convertFile(
          { bytes: fixtures[source], name: `roadmap.${source}` }, target,
          target.startsWith("image-") ? imageOptions : {}
        );
        assertOutput(target, result.bytes);
        if (["html", "markdown", "text"].includes(target)) {
          expect(dec.decode(result.bytes)).toContain("Converter Roadmap");
          expect(dec.decode(result.bytes)).toContain("Local conversion");
        }
      });
    }
  }

  it("parses semantic headings, lists and emphasis", () => {
    expect(rstToHtml(dec.decode(rst))).toContain("<h1>Converter Roadmap</h1>");
    expect(rstToHtml(dec.decode(rst))).toContain("<strong>valid output</strong>");
    expect(texToHtml(dec.decode(tex))).toContain("<h1>Converter Roadmap</h1>");
    expect(texToHtml(dec.decode(tex))).toContain("Parse real input");
  });

  it("rejects binary data honestly", async () => {
    const binary = new Uint8Array([0, 1, 2, 3]);
    await expect(convertFile({ bytes: binary, name: "bad.rst" }, "pdf")).rejects.toThrow(/binary data/);
    await expect(convertFile({ bytes: binary, name: "bad.tex" }, "pdf")).rejects.toThrow(/binary data/);
  });
});
