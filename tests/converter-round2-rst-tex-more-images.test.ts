// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { targetsFor } from "../src/core/converter/matrix";
const enc=(s:string)=>new TextEncoder().encode(s);
function canvas():ConvertOptions{let w=1,h=1;const ctx={translate(){},rotate(){},scale(){},drawImage(){},getImageData:()=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4),colorSpace:"srgb"}) as ImageData};return{canvas:{canvasFactory:()=>({get width(){return w},set width(v){w=v},get height(){return h},set height(v){h=v},getContext:()=>ctx,toBlob(cb:(b:Blob|null)=>void,mime?:string){cb(new Blob([mime==="image/webp"?enc("RIFF0000WEBP"):enc("PNG")],{type:mime??"image/png"}))}})as unknown as HTMLCanvasElement,decode:async()=>({width:10,height:10,close(){}})as ImageBitmap}}}
describe("round 2 RST and TeX GIF/SVG/WebP",()=>{
 it("advertises six pairs",()=>{for(const s of ["rst","tex"]as const)expect(targetsFor(s)).toEqual(expect.arrayContaining(["image-gif","image-svg","image-webp"]));});
 const sources=[["rst",enc("Local report\n============\n\nReadable body."),"report.rst"],["tex",enc("\\section{Local report} Readable body."),"report.tex"]]as const;
 for(const[s,b,n]of sources)for(const[t,e,m,sig]of[["image-gif","gif","image/gif","GIF89a"],["image-svg","svg","image/svg+xml","<svg"],["image-webp","webp","image/webp","RIFF"]]as const)it(`${s} to ${t}`,async()=>{const r=await convertFile({bytes:b,name:n},t,canvas());expect(r).toMatchObject({name:`report.${e}`,mime:m});expect(new TextDecoder().decode(r.bytes.slice(0,100))).toContain(sig);});
 it("rejects blank sources",async()=>{await expect(convertFile({bytes:enc(" "),name:"blank.rst"},"image-svg")).rejects.toThrow(/no readable text/i);await expect(convertFile({bytes:enc(" "),name:"blank.tex"},"image-gif",canvas())).rejects.toThrow(/no readable text/i);});
});
