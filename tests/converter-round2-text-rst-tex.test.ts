// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertFile } from "../src/core/converter/convert";
import { targetsFor } from "../src/core/converter/matrix";
const enc=(s:string)=>new TextEncoder().encode(s);
describe("round 2: TXT to RST and TeX",()=>{
  it("advertises ranks 3635 and 3637",()=>expect(targetsFor("text")).toEqual(expect.arrayContaining(["rst","tex"])));
  it("writes escaped structured RST",async()=>{const r=await convertFile({bytes:enc("A_B * local text."),name:"notes.txt"},"rst");const s=new TextDecoder().decode(r.bytes);expect(r.name).toBe("notes.rst");expect(r.mime).toBe("text/x-rst");expect(s).toMatch(/^Text document\n=============/);expect(s).toContain("A\\_B \\* local text.");});
  it("writes standalone escaped TeX",async()=>{const r=await convertFile({bytes:enc("Budget #1 costs $50 & tax_2026."),name:"notes.txt"},"tex");const s=new TextDecoder().decode(r.bytes);expect(r.name).toBe("notes.tex");expect(r.mime).toBe("application/x-tex");expect(s).toContain("\\begin{document}");expect(s).toContain("Budget \\#1 costs \\$50 \\& tax\\_2026.");expect(s).toContain("\\end{document}");});
  it.each(["rst","tex"]as const)("rejects blank TXT for %s",async(t)=>{await expect(convertFile({bytes:enc(" \n "),name:"empty.txt"},t)).rejects.toThrow(/no readable text/);});
});
