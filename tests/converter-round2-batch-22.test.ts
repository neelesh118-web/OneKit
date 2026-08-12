// @vitest-environment node
import { gzipSync } from "fflate/browser";
import { describe, expect, it } from "vitest";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { targetsFor } from "../src/core/converter/matrix";
const enc=(s:string)=>new TextEncoder().encode(s);
function canvas():ConvertOptions{const c={translate(){},rotate(){},scale(){},drawImage(){}};return{canvas:{canvasFactory:()=>({width:1,height:1,getContext:()=>c,toBlob(cb:(b:Blob|null)=>void,mime?:string){cb(new Blob([mime==="image/jpeg"?new Uint8Array([255,216,255,224]):new Uint8Array([137,80,78,71])],{type:mime??"image/png"}))}})as unknown as HTMLCanvasElement,decode:async()=>({width:10,height:10,close(){}})as ImageBitmap}}}
describe("round 2 batch 22: ZABW raster",()=>{const bytes=gzipSync(enc('<?xml version="1.0"?><abiword><section><p style="Heading 1">Compressed report</p><p>Readable local content.</p></section></abiword>'));it("advertises both pairs",()=>expect(targetsFor("zabw")).toEqual(expect.arrayContaining(["image-png","image-jpeg"])));it.each([["image-png","png","image/png",[137,80,78,71]],["image-jpeg","jpg","image/jpeg",[255,216,255,224]]]as const)("converts real ZABW to %s",async(target,ext,mime,sig)=>{const r=await convertFile({bytes,name:"report.zabw"},target,canvas());expect(r).toMatchObject({name:`report.${ext}`,mime});expect(Array.from(r.bytes.slice(0,4))).toEqual(sig)});it("rejects corrupt ZABW",async()=>{await expect(convertFile({bytes:enc("not gzip"),name:"bad.zabw"},"image-png",canvas())).rejects.toThrow(/gzip-compressed|ZABW|AbiWord/i)});});
