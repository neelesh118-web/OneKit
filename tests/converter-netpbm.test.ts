// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  decodePam,
  decodePbm,
  decodePgm,
  decodeXbm,
  encodePam,
  encodePbm,
  encodePgm,
  encodeXbm
} from "../src/core/converter/netpbm";
import { detectFile } from "../src/core/converter/detect";
import { targetsFor, targetExtension } from "../src/core/converter/matrix";
import { convertFile } from "../src/core/converter/convert";
import { bytesToBase64, bytesToHex, base64ToBytes, hexToBytes } from "../src/core/converter/text";
import type { ImageConvertDeps, ImageTarget } from "../src/core/converter/images";

const enc = new TextEncoder();
const toBytes = (s: string): Uint8Array => enc.encode(s);

/** Same fake canvas the existing image tests use — known pixels in, fake blob out. */
function fakeDeps(width: number, height: number, encodeTarget: ImageTarget): ImageConvertDeps {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = 200;
    rgba[i * 4 + 1] = 40;
    rgba[i * 4 + 2] = 40;
    rgba[i * 4 + 3] = 255;
  }
  const ctx = {
    drawImage(): void {},
    translate(): void {},
    rotate(): void {},
    scale(): void {},
    getImageData(x: number, y: number, w: number, h: number): { width: number; height: number; data: Uint8ClampedArray } {
      return { width: w, height: h, data: rgba };
    }
  };
  const canvas = {
    width,
    height,
    getContext: (kind: string) => (kind === "2d" ? ctx : null),
    toBlob(cb: (b: Blob | null) => void, _mime?: string, _quality?: number): void {
      if (encodeTarget === "image-gif" || encodeTarget === "image-pbm" || encodeTarget === "image-pgm" ||
          encodeTarget === "image-pam" || encodeTarget === "image-xbm") {
        cb(null);
        return;
      }
      cb(new Blob([new Uint8Array([0x00, 0x01, 0x02, 0x03])], { type: "application/octet-stream" }));
    }
  };
  return {
    canvasFactory: () => canvas as unknown as HTMLCanvasElement,
    decode: async () => ({ width, height, close(): void {} }) as unknown as ImageBitmap
  };
}

describe("Netpbm decoders", () => {
  it("decodes P1 (ASCII) 1-bit PBM — 1 is black, 0 is white", () => {
    const img = decodePbm(toBytes("P1\n2 2\n0 1\n1 0\n"));
    expect(img.width).toBe(2);
    expect(img.height).toBe(2);
    expect(img.data[0]).toBe(255); // white
    expect(img.data[4]).toBe(0); // black
    expect(img.data[8]).toBe(0); // black
    expect(img.data[12]).toBe(255); // white
    expect(img.data[3]).toBe(255); // alpha everywhere
  });

  it("decodes P4 (binary) PBM with row padding", () => {
    // 10 wide × 2 tall: row 1 = 1010101010, row 2 = 0101010101.
    const row1 = 0b10101010; // first 8 pixels
    const row2 = 0b01010101;
    const body = new Uint8Array([row1, 0b10100000, row2, 0b01010000]);
    const img = decodePbm(new Uint8Array([...toBytes("P4\n10 2\n"), ...body]));
    expect(img.width).toBe(10);
    expect(img.height).toBe(2);
    expect(img.data[0]).toBe(0); // 1 = black
    expect(img.data[4]).toBe(255); // 0 = white
    expect(img.data[40]).toBe(255); // row 2 starts with 0
    expect(img.data[44]).toBe(0);
  });

  it("decodes P2 (ASCII) PGM with maxval scaling", () => {
    const img = decodePgm(toBytes("P2\n2 1\n255\n0 255\n"));
    expect(img.data[0]).toBe(0);
    expect(img.data[1]).toBe(0);
    expect(img.data[2]).toBe(0);
    expect(img.data[4]).toBe(255);
    expect(img.data[3]).toBe(255);
  });

  it("decodes P5 (binary) PGM", () => {
    const img = decodePgm(new Uint8Array([...toBytes("P5\n2 1\n255\n"), 64, 128]));
    expect(img.data[0]).toBe(64);
    expect(img.data[4]).toBe(128);
  });

  it("decodes P7 (PAM) RGBA", () => {
    const img = decodePam(new Uint8Array([
      ...toBytes("P7\nWIDTH 2\nHEIGHT 1\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n"),
      10, 20, 30, 40, 50, 60, 70, 80
    ]));
    expect(img.data[0]).toBe(10);
    expect(img.data[1]).toBe(20);
    expect(img.data[2]).toBe(30);
    expect(img.data[3]).toBe(40);
    expect(img.data[4]).toBe(50);
    expect(img.data[7]).toBe(80);
  });

  it("decodes XBM C-source bitmaps (MSB first, 1 = black)", () => {
    const src =
      "#define icon_width 8\n" +
      "#define icon_height 2\n" +
      "static unsigned char icon_bits[] = {\n  0xAA, 0x55\n};\n";
    const img = decodeXbm(toBytes(src));
    expect(img.width).toBe(8);
    expect(img.height).toBe(2);
    expect(img.data[0]).toBe(0); // 0xAA = 10101010 → 1 black
    expect(img.data[4]).toBe(255); // 0 = white
    expect(img.data[32]).toBe(255); // 0x55 row 2 starts white
    expect(img.data[36]).toBe(0);
  });
});

describe("Netpbm encoders round-trip", () => {
  it("P4 round-trips a known pattern", () => {
    const img = decodePbm(encodePbm(decodePbm(toBytes("P1\n3 2\n1 0 1\n0 1 0\n"))));
    expect(img.width).toBe(3);
    expect(img.height).toBe(2);
    expect(img.data[0]).toBe(0);
    expect(img.data[4]).toBe(255);
    expect(img.data[8]).toBe(0);
  });

  it("PGM round-trips grayscale", () => {
    const img = decodePgm(encodePgm(decodePgm(new Uint8Array([...toBytes("P5\n2 2\n255\n"), 10, 90, 200, 250]))));
    expect(img.width).toBe(2);
    expect(img.height).toBe(2);
    expect(img.data[0]).toBe(10);
    expect(img.data[4]).toBe(90);
    expect(img.data[8]).toBe(200);
    expect(img.data[12]).toBe(250);
  });

  it("PAM round-trips RGBA", () => {
    const img = decodePam(encodePam(decodePam(new Uint8Array([
      ...toBytes("P7\nWIDTH 1\nHEIGHT 2\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n"),
      10, 20, 30, 40, 50, 60, 70, 80
    ]))));
    expect(img.data[0]).toBe(10);
    expect(img.data[7]).toBe(80);
  });

  it("XBM round-trips a pattern", () => {
    const img = decodeXbm(encodeXbm(decodeXbm(
      toBytes("#define i_width 8\n#define i_height 1\nstatic unsigned char i_bits[] = { 0xAA };\n")
    )));
    expect(img.width).toBe(8);
    expect(img.data[0]).toBe(0);
    expect(img.data[4]).toBe(255);
  });
});

describe("detection and matrix wiring", () => {
  it("detects all four new formats from magic bytes", () => {
    expect(detectFile(toBytes("P1\n2 2\n0 1\n1 0\n"), "a.dat").type).toBe("image-pbm");
    expect(detectFile(new Uint8Array([...toBytes("P4\n8 1\n"), 0xff]), "a.dat").type).toBe("image-pbm");
    expect(detectFile(toBytes("P2\n2 2\n255\n0 1\n1 0\n"), "a.dat").type).toBe("image-pgm");
    expect(detectFile(new Uint8Array([...toBytes("P5\n2 2\n255\n"), 1, 2, 3, 4]), "a.dat").type).toBe("image-pgm");
    expect(detectFile(toBytes("P7\nWIDTH 1\nHEIGHT 1\nENDHDR\n"), "a.dat").type).toBe("image-pam");
    expect(detectFile(toBytes("#define x_width 2\n"), "a.dat").type).toBe("image-xbm");
  });

  it("maps target extensions for the new formats", () => {
    expect(targetExtension("image-pbm")).toBe("pbm");
    expect(targetExtension("image-pgm")).toBe("pgm");
    expect(targetExtension("image-pam")).toBe("pam");
    expect(targetExtension("image-xbm")).toBe("xbm");
  });

  it("new image sources offer the full raster + document target set", () => {
    for (const src of ["image-pbm", "image-pgm", "image-pam", "image-xbm"] as const) {
      const targets = targetsFor(src);
      expect(targets).toContain("image-png");
      expect(targets).toContain("image-tiff"); // never the self-target
      expect(targets).toContain("pdf");
      expect(targets).toContain("docx");
      expect(targets).not.toContain(src); // no self-conversion
    }
  });

  it("pdf row now reaches every raster target", () => {
    const targets = targetsFor("pdf");
    for (const t of ["image-gif", "image-webp", "image-bmp", "image-tiff", "image-ico", "image-avif"]) {
      expect(targets).toContain(t);
    }
  });

  it("base64/hex rows advertise the decodable union", () => {
    for (const src of ["text-base64", "text-hex"] as const) {
      const targets = targetsFor(src);
      expect(targets).toContain("text");
      expect(targets).toContain("pdf");
      expect(targets).toContain("image-png");
      expect(targets).toContain("docx");
    }
  });
});

describe("base64/hex decode → real file conversion", () => {
  it("byte helpers round-trip binary data", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255]);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
    expect(Array.from(hexToBytes(bytesToHex(bytes)))).toEqual(Array.from(bytes));
  });

  it("decodes a base64-embedded PNG and converts it like an image", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
    const result = await convertFile(
      { bytes: toBytes(bytesToBase64(png)), name: "payload.b64" },
      "image-jpeg",
      { canvas: fakeDeps(2, 2, "image-jpeg") }
    );
    expect(result.name).toBe("payload.jpg");
    expect(result.mime).toBe("image/jpeg");
  });

  it("rejects a target the decoded file can't reach, honestly", async () => {
    // A base64 string holding a VCF — fb2 is advertised for base64 input but
    // not reachable from a decoded contact file, so the error names the truth.
    const vcf = toBytes("BEGIN:VCARD\nVERSION:3.0\nFN:Jane Doe\nEND:VCARD\n");
    await expect(
      convertFile({ bytes: toBytes(bytesToBase64(vcf)), name: "contact.b64" }, "fb2")
    ).rejects.toThrow(/decoded file is a VCF contacts/);
  });

  it("keeps the plain-text decode path for base64 prose", async () => {
    const result = await convertFile(
      { bytes: toBytes(bytesToBase64(toBytes("hello world"))), name: "note.b64" },
      "text"
    );
    expect(new TextDecoder().decode(result.bytes)).toBe("hello world");
  });
});

describe("netpbm conversion through the real pipeline (fake canvas)", () => {
  it("PBM → PGM runs decode → canvas → encode with correct naming", async () => {
    const result = await convertFile(
      { bytes: toBytes("P1\n2 2\n0 1\n1 0\n"), name: "pattern.pbm" },
      "image-pgm",
      { canvas: fakeDeps(2, 2, "image-pgm") }
    );
    expect(result.name).toBe("pattern.pgm");
    expect(result.mime).toBe("image/x-portable-graymap");
  });

  it("XBM → PPM runs the decode → canvas → encode pipeline", async () => {
    const xbm = toBytes("#define i_width 8\n#define i_height 1\nstatic unsigned char i_bits[] = { 0xAA };\n");
    const result = await convertFile(
      { bytes: xbm, name: "icon.xbm" },
      "image-ppm",
      { canvas: fakeDeps(8, 1, "image-ppm") }
    );
    expect(result.name).toBe("icon.ppm");
    expect(result.mime).toBe("image/x-portable-pixmap");
    expect(result.bytes[0]).toBe(0x50); // starts with P6
    expect(result.bytes[1]).toBe(0x36);
  });
});
