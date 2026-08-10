// @vitest-environment node
import { describe, expect, it } from "vitest";
import { passwordsCsv, toCsv, totpCsv } from "../src/core/csv-export";

describe("toCsv", () => {
  it("escapes quotes and commas", () => {
    expect(toCsv([['a"b', "c,d"]])).toBe('"a""b","c,d"');
  });
});

describe("passwordsCsv", () => {
  it("emits the standard interchange header", () => {
    const csv = passwordsCsv([{ name: "GitHub", url: "https://github.com", username: "u", password: "p", notes: "" }]);
    expect(csv.split("\n")[0]).toBe('"name","url","username","password","notes"');
    expect(csv).toContain('"GitHub","https://github.com","u","p",""');
  });
});

describe("totpCsv", () => {
  it("emits otpauth-style columns", () => {
    const csv = totpCsv([{ label: "GitHub", secret: "JBSWY3DPEHPK3PXP" }]);
    expect(csv.split("\n")[0]).toBe('"label","secret","issuer","algorithm","digits","period"');
    expect(csv).toContain('"GitHub","JBSWY3DPEHPK3PXP","","SHA1","6","30"');
  });
});
