// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  filesToTar,
  filesToZip,
  gunzipAsTar,
  gunzipAsZip,
  gunzipToText,
  gzipBytes,
  unzipToFiles,
  untarToFiles
} from "../src/core/converter/archives";
import { fromTar, toTar } from "../src/core/converter/tar";

const sample = (): Record<string, Uint8Array> => ({
  "hello.txt": new TextEncoder().encode("Hello world"),
  "nested/data.bin": new Uint8Array([1, 2, 3, 4, 5])
});

describe("converter archives", () => {
  it("round-trips zip", () => {
    const files = sample();
    const zip = filesToZip(files);
    expect(zip[0]).toBe(0x50); // PK
    const back = unzipToFiles(zip);
    expect(new TextDecoder().decode(back["hello.txt"])).toBe("Hello world");
    expect(Array.from(back["nested/data.bin"]!)).toEqual([1, 2, 3, 4, 5]);
  });

  it("round-trips tar", () => {
    const files = sample();
    const tar = toTar(files);
    expect(new TextDecoder().decode(tar.subarray(257, 262))).toBe("ustar");
    const back = fromTar(tar);
    expect(new TextDecoder().decode(back["hello.txt"])).toBe("Hello world");
    expect(Array.from(back["nested/data.bin"]!)).toEqual([1, 2, 3, 4, 5]);
  });

  it("converts zip → tar and back without losing content", () => {
    const zip = filesToZip(sample());
    const tar = filesToTar(unzipToFiles(zip));
    const back = untarToFiles(tar);
    expect(new TextDecoder().decode(back["hello.txt"])).toBe("Hello world");
  });

  it("converts tar → zip and back", () => {
    const tar = toTar(sample());
    const zip = filesToZip(untarToFiles(tar));
    const back = unzipToFiles(zip);
    expect(new TextDecoder().decode(back["hello.txt"])).toBe("Hello world");
  });

  it("gzips and gunzips text", () => {
    const gz = gzipBytes(new TextEncoder().encode("compress me"));
    expect(gz[0]).toBe(0x1f);
    expect(gz[1]).toBe(0x8b);
    expect(gunzipToText(gz)).toBe("compress me");
  });

  it("validates the inner format of a .gz before re-emitting", () => {
    const zipGz = gzipBytes(filesToZip(sample()));
    expect(Array.from(gunzipAsZip(zipGz)).length).toBeGreaterThan(0);
    expect(() => gunzipAsTar(zipGz)).toThrow(/doesn't contain a TAR/);
  });
});
