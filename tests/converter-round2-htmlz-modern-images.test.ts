// @vitest-environment node
import { describe, expect, it } from "vitest";
import { zipSync } from "fflate/browser";
import { convertFile, type ConvertOptions } from "../src/core/converter/convert";
import { targetsFor } from "../src/core/converter/matrix";
const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
function canvasOptions(): ConvertOptions {
  let width=1,height=1; const context={translate():void{},rotate():void{},scale():void{},drawImage():void{},getImageData():ImageData{const data=new Uint8ClampedArray(width*height*4);data.fill(255);return{width,height,data,colorSpace:"srgb"}as ImageData;}};
  return {canvas:{canvasFactory:()=>({get width(){return width;},set width(v:number){width=v;},get height(){return height;},set height(v:number){height=v;},getContext:()=>context,toBlob(cb:(b:Blob|null)=>void,mime?:string):void{const b=mime==="image/webp"?new Uint8Array([82,73,70,70,0,0,0,0,87,69,66,80]):new Uint8Array([137,80,78,71]);cb(new Blob([b],{type:mime??"image/png"}));}})as unknown as HTMLCanvasElement,decode:async(blob)=>{const svg=await blob.text();return{width:Number(svg.match(/width="(\d+)"/)?.[1]??1),height:Number(svg.match(/height="(\d+)"/)?.[1]??1),close():void{}}as unknown as ImageBitmap;}}};
}
describe("round 2: HTMLZ modern images",()=>{
  it("advertises ranks 3091, 3095, and 3097",()=>expect(targetsFor("htmlz")).toEqual(expect.arrayContaining(["image-gif","image-svg","image-webp"])));
  it.each([["image-gif","gif","image/gif","GIF89a"],["image-svg","svg","image/svg+xml","<svg"],["image-webp","webp","image/webp","RIFF"]]as const)("converts HTMLZ to %s",async(target,ext,mime,sig)=>{
    const bytes=zipSync({"index.html":encode("<!doctype html><html><body><h1>Local book</h1><p>Readable prose.</p></body></html>")});
    const result=await convertFile({bytes,name:"book.htmlz"},target,canvasOptions());expect(result.name).toBe(`book.${ext}`);expect(result.mime).toBe(mime);expect(new TextDecoder().decode(result.bytes.slice(0,120))).toContain(sig);
  });
  it("rejects archive without HTML",async()=>{await expect(convertFile({bytes:zipSync({"readme.txt":encode("none")}),name:"bad.htmlz"},"image-svg",canvasOptions())).rejects.toThrow(/contains no HTML document/);});
  it("rejects unreadable embedded HTML",async()=>{await expect(convertFile({bytes:zipSync({"index.html":encode("plain text")}),name:"bad.htmlz"},"image-webp",canvasOptions())).rejects.toThrow(/not readable HTML/);});
});
