// @vitest-environment node
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate/browser";
import { convertFile } from "../src/core/converter/convert";
import { targetsFor } from "../src/core/converter/matrix";
const enc=(s:string)=>new TextEncoder().encode(s);
describe("round 2 TXT office/markup targets",()=>{
 it("advertises ranks 3631, 3635, and 3637",()=>expect(targetsFor("text")).toEqual(expect.arrayContaining(["dotx","rst","tex"])));
 it("writes a genuine DOTX package",async()=>{const r=await convertFile({bytes:enc("Reusable local template"),name:"notes.txt"},"dotx");expect(r).toMatchObject({name:"notes.dotx",mime:"application/vnd.openxmlformats-officedocument.wordprocessingml.template"});const f=unzipSync(r.bytes);expect(strFromU8(f["[Content_Types].xml"]!)).toContain("wordprocessingml.template.main+xml");expect(strFromU8(f["word/document.xml"]!)).toContain("Reusable local template");});
 it("preserves text as valid RST",async()=>{const r=await convertFile({bytes:enc("Local heading\n=============\n\nReadable body."),name:"notes.txt"},"rst");expect(r).toMatchObject({name:"notes.rst",mime:"text/x-rst"});expect(new TextDecoder().decode(r.bytes)).toContain("Readable body.");});
 it("writes standalone escaped TeX",async()=>{const r=await convertFile({bytes:enc("Revenue & margin 50%"),name:"notes.txt"},"tex");expect(r).toMatchObject({name:"notes.tex",mime:"application/x-tex"});const t=new TextDecoder().decode(r.bytes);expect(t).toContain("Revenue \\& margin 50\\%");expect(t).toContain("\\end{document}");});
 it("rejects blank text for all three",async()=>{for(const target of ["dotx","rst","tex"]as const)await expect(convertFile({bytes:enc(" \n"),name:"blank.txt"},target)).rejects.toThrow(/no readable text/i);});
});
