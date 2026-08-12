// @vitest-environment node
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate/browser";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { textToDocx, textToDotx } from "../src/core/converter/documents";
import { odpToSlides } from "../src/core/converter/odf";
import { targetsFor } from "../src/core/converter/matrix";
function canvas():ConvertOptions{const c={translate(){},rotate(){},scale(){},drawImage(){}};return{canvas:{canvasFactory:()=>({width:1,height:1,getContext:()=>c,toBlob(cb:(b:Blob|null)=>void,mime?:string){cb(new Blob([mime==="image/jpeg"?new Uint8Array([255,216,255,224]):new Uint8Array([137,80,78,71])],{type:mime??"image/png"}))}})as unknown as HTMLCanvasElement,decode:async()=>({width:10,height:10,close(){}})as ImageBitmap}}}
describe("round 2 batch 20: DOCX to ODP and DOTX raster",()=>{
 it("advertises three pairs",()=>{expect(targetsFor("docx")).toContain("odp");expect(targetsFor("dotx")).toEqual(expect.arrayContaining(["image-png","image-jpeg"]));});
 it("converts DOCX text into a valid readable ODP",async()=>{const r=await convertFile({bytes:textToDocx("Quarterly document\nReadable local details."),name:"report.docx"},"odp");expect(r).toMatchObject({name:"report.odp",mime:"application/vnd.oasis.opendocument.presentation"});const f=unzipSync(r.bytes);expect(strFromU8(f.mimetype!)).toBe("application/vnd.oasis.opendocument.presentation");expect(strFromU8(f["content.xml"]!)).toContain("Quarterly document");expect(odpToSlides(r.bytes)[0]!.title).toBe("Quarterly document");});
 it.each([["image-png","png","image/png",[137,80,78,71]],["image-jpeg","jpg","image/jpeg",[255,216,255,224]]]as const)("converts DOTX to %s",async(target,ext,mime,sig)=>{const r=await convertFile({bytes:textToDotx("Template content"),name:"template.dotx"},target,canvas());expect(r).toMatchObject({name:`template.${ext}`,mime});expect(Array.from(r.bytes.slice(0,4))).toEqual(sig)});
 it("rejects corrupt OOXML",async()=>{const b=new Uint8Array([80,75,3]);await expect(convertFile({bytes:b,name:"bad.dotx"},"image-png",canvas())).rejects.toThrow(/docx|corrupt/i);await expect(convertFile({bytes:b,name:"bad.docx"},"odp")).rejects.toThrow(/docx|corrupt/i)});
});
