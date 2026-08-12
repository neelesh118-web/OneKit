// @vitest-environment node
import { zipSync } from "fflate/browser";
import { describe, expect, it } from "vitest";
import { convertFile } from "../src/core/converter/convert";
import { targetsFor } from "../src/core/converter/matrix";
const enc=(s:string)=>new TextEncoder().encode(s);
describe("round 2 batch 31: HTMLZ to FB2",()=>{it("advertises rank 5446",()=>expect(targetsFor("htmlz")).toContain("fb2"));it("converts readable HTMLZ into FictionBook XML",async()=>{const bytes=zipSync({"index.html":enc("<!doctype html><html><body><h1>Local book</h1><p>Readable chapter content.</p></body></html>")});const r=await convertFile({bytes,name:"book.htmlz"},"fb2");const xml=new TextDecoder().decode(r.bytes);expect(r).toMatchObject({name:"book.fb2",mime:"application/x-fictionbook+xml"});expect(xml).toContain("<FictionBook");expect(xml).toContain("Readable chapter content.");expect(xml).toContain("<book-title>Book</book-title>")});it("rejects corrupt and HTML-free HTMLZ",async()=>{await expect(convertFile({bytes:enc("bad"),name:"bad.htmlz"},"fb2")).rejects.toThrow(/htmlz|ZIP/i);await expect(convertFile({bytes:zipSync({"readme.txt":enc("text")}),name:"empty.htmlz"},"fb2")).rejects.toThrow(/no HTML/i)});});
