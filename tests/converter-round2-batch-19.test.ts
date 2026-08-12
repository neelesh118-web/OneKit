// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { strFromU8, unzipSync } from "fflate/browser";
import { convertFile } from "../src/core/converter/convert";
import { targetsFor } from "../src/core/converter/matrix";

async function fixture():Promise<Uint8Array>{const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);const page=pdf.addPage([500,700]);page.drawText("Quarterly results and local details",{x:50,y:630,size:18,font});return pdf.save();}
describe("round 2 batch 19: PDF presentation variants",()=>{
  it("advertises POTX and PPSX",()=>expect(targetsFor("pdf")).toEqual(expect.arrayContaining(["potx","ppsx"])));
  it.each([["potx","application/vnd.openxmlformats-officedocument.presentationml.template","template.main+xml"],["ppsx","application/vnd.openxmlformats-officedocument.presentationml.slideshow","slideshow.main+xml"]] as const)("converts PDF to %s with correct OOXML type",async(target,mime,mainType)=>{const r=await convertFile({bytes:await fixture(),name:"report.pdf"},target);expect(r).toMatchObject({name:`report.${target}`,mime});const files=unzipSync(r.bytes);expect(files["ppt/presentation.xml"]).toBeDefined();expect(files["ppt/slides/slide1.xml"]).toBeDefined();expect(strFromU8(files["[Content_Types].xml"]!)).toContain(mainType);expect(strFromU8(files["[Content_Types].xml"]!)).not.toContain("presentation.main+xml");});
  it("rejects corrupt PDF",async()=>{await expect(convertFile({bytes:new Uint8Array([37,80,68,70]),name:"bad.pdf"},"potx")).rejects.toThrow(/PDF/i)});
});
