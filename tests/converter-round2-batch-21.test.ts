// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { buildPptx } from "../src/core/converter/pptx";
import { targetsFor } from "../src/core/converter/matrix";
function canvas():ConvertOptions{const c={translate(){},rotate(){},scale(){},drawImage(){}};return{canvas:{canvasFactory:()=>({width:1,height:1,getContext:()=>c,toBlob(cb:(b:Blob|null)=>void,mime?:string){cb(new Blob([mime==="image/jpeg"?new Uint8Array([255,216,255,224]):new Uint8Array([137,80,78,71])],{type:mime??"image/png"}))}})as unknown as HTMLCanvasElement,decode:async()=>({width:10,height:10,close(){}})as ImageBitmap}}}
describe("round 2 batch 21: presentation variants to raster",()=>{
 const bytes=buildPptx([{title:"Quarterly deck",lines:["Readable slide text"]}]);
 it("advertises all six pairs",()=>{for(const source of ["potx","ppsx","pptm"] as const)expect(targetsFor(source)).toEqual(expect.arrayContaining(["image-png","image-jpeg"]));});
 for(const source of ["potx","ppsx","pptm"] as const)for(const [target,ext,mime,sig]of[["image-png","png","image/png",[137,80,78,71]],["image-jpeg","jpg","image/jpeg",[255,216,255,224]]]as const)it(`${source} converts to ${target}`,async()=>{const r=await convertFile({bytes,name:`deck.${source}`},target,canvas());expect(r).toMatchObject({name:`deck.${ext}`,mime});expect(Array.from(r.bytes.slice(0,4))).toEqual(sig)});
 it("rejects corrupt presentation variants",async()=>{const bad=new Uint8Array([80,75,3]);for(const source of ["potx","ppsx","pptm"] as const)await expect(convertFile({bytes:bad,name:`bad.${source}`},"image-png",canvas())).rejects.toThrow(/pptx|PowerPoint|corrupt/i)});
});
