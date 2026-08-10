// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertBatchToZip, uniqueName } from "../src/core/converter/batch-zip";
import { unzipToFiles } from "../src/core/converter/archives";

const toBytes = (s: string): Uint8Array => new TextEncoder().encode(s);

describe("uniqueName", () => {
  it("keeps the first name and suffixes collisions", () => {
    const used = new Set<string>();
    expect(uniqueName("a.txt", used)).toBe("a.txt");
    expect(uniqueName("a.txt", used)).toBe("a-1.txt");
    expect(uniqueName("a.txt", used)).toBe("a-2.txt");
  });

  it("handles files without an extension", () => {
    const used = new Set<string>();
    expect(uniqueName("README", used)).toBe("README");
    expect(uniqueName("README", used)).toBe("README-1");
  });
});

describe("convertBatchToZip", () => {
  it("converts a batch of JSON files to YAML and zips them", async () => {
    const outcome = await convertBatchToZip(
      [
        { name: "one.json", bytes: toBytes('{"number": 1}') },
        { name: "two.json", bytes: toBytes('{"number": 2}') }
      ],
      "yaml"
    );
    expect(outcome.failed).toHaveLength(0);
    expect(outcome.converted).toHaveLength(2);
    const files = unzipToFiles(outcome.zip);
    expect(Object.keys(files).sort()).toEqual(["one.yaml", "two.yaml"]);
    expect(new TextDecoder().decode(files["one.yaml"]!)).toContain("number: 1");
    expect(new TextDecoder().decode(files["two.yaml"]!)).toContain("number: 2");
  });

  it("isolates failures and still zips the files that converted", async () => {
    const outcome = await convertBatchToZip(
      [
        { name: "good.json", bytes: toBytes('{"ok": true}') },
        { name: "bad.zzz", bytes: toBytes("not detectable") }
      ],
      "yaml"
    );
    expect(outcome.converted).toHaveLength(1);
    expect(outcome.failed).toHaveLength(1);
    expect(outcome.failed[0]!.source).toBe("bad.zzz");
    expect(outcome.failed[0]!.error).toMatch(/Couldn't detect/);
    const files = unzipToFiles(outcome.zip);
    expect(Object.keys(files)).toEqual(["good.yaml"]);
  });

  it("dedupes colliding output names inside the zip", async () => {
    const outcome = await convertBatchToZip(
      [
      { name: "a.json", bytes: toBytes('{"value": 1}') },
      { name: "a.json", bytes: toBytes('{"value": 2}') }
      ],
      "yaml"
    );
    expect(outcome.converted.map((c) => c.output)).toEqual(["a.yaml", "a-1.yaml"]);
    const files = unzipToFiles(outcome.zip);
    expect(Object.keys(files).sort()).toEqual(["a-1.yaml", "a.yaml"]);
  });

  it("throws honestly when nothing could be converted", async () => {
    await expect(
      convertBatchToZip([{ name: "x.zzz", bytes: toBytes("nope") }], "yaml")
    ).rejects.toThrow(/nothing to zip/);
  });

  it("throws honestly for an empty batch", async () => {
    await expect(convertBatchToZip([], "yaml")).rejects.toThrow(/No files to convert/);
  });
});
