import { describe, expect, it } from "vitest";
import {
  classifyImageUrl,
  collectImageUrls,
  largestSrcsetUrl,
  MAX_IMAGES,
  resolveUrl
} from "../src/core/image-collector";

const PAGE = "https://example.com/blog/post";

describe("resolveUrl", () => {
  it("resolves relative URLs against the page", () => {
    expect(resolveUrl("/img/a.png", PAGE)).toBe("https://example.com/img/a.png");
    expect(resolveUrl("https://cdn.example.com/x.jpg", PAGE)).toBe("https://cdn.example.com/x.jpg");
    expect(resolveUrl("", PAGE)).toBe("");
  });
});

describe("largestSrcsetUrl", () => {
  it("picks the highest-density candidate", () => {
    const url = largestSrcsetUrl("/a.png 1x, /b.png 2x, /c.png 3x", PAGE);
    expect(url).toBe("https://example.com/c.png");
  });
});

describe("collectImageUrls", () => {
  it("collects, resolves, and dedupes image URLs", () => {
    const images = collectImageUrls(
      [
        { src: "/img/a.png", width: 800, height: 600, alt: "Photo A" },
        { src: "/img/a.png" }, // duplicate
        { src: "https://cdn.example.com/b.jpg" },
        { src: "data:image/png;base64,AAAA" }, // skipped
        { src: "blob:https://example.com/uuid" }, // skipped
        { src: "/img/c.webp", srcset: "/img/c2x.webp 2x" }
      ],
      PAGE
    );
    expect(images).toHaveLength(3);
    expect(images[0]).toEqual({
      url: "https://example.com/img/a.png",
      width: 800,
      height: 600,
      alt: "Photo A"
    });
    expect(images[1]!.url).toBe("https://cdn.example.com/b.jpg");
    expect(images[2]!.url).toBe("https://example.com/img/c2x.webp");
  });

  it("caps the result", () => {
    const many = Array.from({ length: MAX_IMAGES + 50 }, (_, i) => ({ src: `/img/${i}.png` }));
    const collected = collectImageUrls(many, PAGE);
    expect(collected).toHaveLength(MAX_IMAGES);
  });
});

describe("classifyImageUrl", () => {
  it("classifies by extension", () => {
    expect(classifyImageUrl("https://x.com/a.png?w=100")).toBe("png");
    expect(classifyImageUrl("https://x.com/a.jpg")).toBe("jpeg");
    expect(classifyImageUrl("https://x.com/a.webp")).toBe("webp");
    expect(classifyImageUrl("https://x.com/a.gif")).toBe("gif");
    expect(classifyImageUrl("https://x.com/a.svg")).toBe("svg");
    expect(classifyImageUrl("https://x.com/photo")).toBe("other");
  });
});
