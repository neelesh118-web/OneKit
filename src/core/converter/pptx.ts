/**
 * PowerPoint (PPTX) reading and writing, plus the slide shape the
 * OpenDocument reader in odf.ts also produces.
 *
 * Reading pulls the text out of every slide in order. Writing builds a
 * complete OOXML package (master, layout, theme, slides) holding one
 * text slide per section. Speaker notes, images, animations and exact
 * layout are not carried across: the text is.
 */
import { strFromU8, unzipSync, zipSync } from "fflate/browser";
import { escapeXml, runTextLines } from "./xml-text";

export interface Slide {
  /** The slide's first line, used as its heading. */
  title: string;
  /** The remaining lines, in reading order. */
  lines: string[];
}

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

/** Groups a slide's lines into the shared Slide shape. */
export function linesToSlide(lines: string[]): Slide {
  return { title: lines[0] ?? "", lines: lines.slice(1) };
}

/** PPTX → slides, in presentation order. */
export function pptxToSlides(bytes: Uint8Array): Slide[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("Could not read this .pptx file — it may be corrupt or password-protected.");
  }
  const slideNames = Object.keys(files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => slideNumber(a) - slideNumber(b));
  if (slideNames.length === 0) {
    throw new Error("This .pptx file has no slides to read.");
  }
  return slideNames.map((name) => linesToSlide(runTextLines(strFromU8(files[name]!), "a:p", "a:t")));
}

function slideNumber(name: string): number {
  return parseInt(/(\d+)\.xml$/.exec(name)?.[1] ?? "0", 10);
}

/* Slides → text / HTML ------------------------------------------------- */

/** Slides → plain text, one titled block per slide. */
export function slidesToText(slides: Slide[]): string {
  return slides
    .map((slide, i) => [slide.title || `Slide ${i + 1}`, ...slide.lines].join("\n"))
    .join("\n\n")
    .trim();
}

/** Slides → HTML, one section per slide. */
export function slidesToHtml(slides: Slide[], documentTitle: string): string {
  const body = slides
    .map((slide, i) => {
      const heading = escapeXml(slide.title || `Slide ${i + 1}`);
      const items = slide.lines.map((l) => `<li>${escapeXml(l)}</li>`).join("\n");
      return `<section>\n<h2>${heading}</h2>\n${items ? `<ul>\n${items}\n</ul>` : ""}\n</section>`;
    })
    .join("\n");
  return (
    `<!doctype html>\n<html><head><meta charset="utf-8"><title>${escapeXml(documentTitle)}</title></head>\n` +
    `<body>\n${body}\n</body>\n</html>`
  );
}

/**
 * Splits flowing text into slides: blank-line-separated blocks become
 * slides, the block's first line its title. Long blocks are split so a
 * slide never runs past `maxLines` bullets.
 */
export function textToSlides(text: string, maxLines = 8): Slide[] {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.split("\n").map((l) => l.trim()).filter(Boolean))
    .filter((b) => b.length > 0);
  if (blocks.length === 0) return [{ title: "", lines: [] }];
  const slides: Slide[] = [];
  for (const block of blocks) {
    const title = block[0]!;
    const body = block.slice(1);
    if (body.length === 0) {
      slides.push({ title, lines: [] });
      continue;
    }
    for (let i = 0; i < body.length; i += maxLines) {
      slides.push({
        title: i === 0 ? title : `${title} (cont.)`,
        lines: body.slice(i, i + maxLines)
      });
    }
  }
  return slides;
}

/* Text → PPTX ---------------------------------------------------------- */

const RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const DOC_RELS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PML = "http://schemas.openxmlformats.org/presentationml/2006/main";
const DML = "http://schemas.openxmlformats.org/drawingml/2006/main";

/** Slide size: 10 × 7.5 inches in EMUs (the 4:3 PowerPoint default). */
const SLIDE_W = 9144000;
const SLIDE_H = 6858000;

function relsXml(entries: { id: string; type: string; target: string }[]): string {
  const items = entries
    .map((e) => `<Relationship Id="${e.id}" Type="${DOC_RELS}/${e.type}" Target="${e.target}"/>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${RELS_NS}">${items}</Relationships>`;
}

/** A placeholder shape — the same geometry in the master, layout and slides. */
function shape(id: number, name: string, type: "title" | "body", body: string): string {
  const y = type === "title" ? 457200 : 1828800;
  const h = type === "title" ? 1143000 : 4114800;
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>` +
    `<p:nvPr><p:ph type="${type}"${type === "body" ? ' idx="1"' : ""}/></p:nvPr></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="685800" y="${y}"/><a:ext cx="7772400" cy="${h}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square"><a:normAutofit/></a:bodyPr><a:lstStyle/>${body}</p:txBody></p:sp>`
  );
}

const EMPTY_PARAGRAPH = `<a:p><a:endParaRPr lang="en-US"/></a:p>`;

function paragraph(text: string): string {
  return `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${escapeXml(text)}</a:t></a:r></a:p>`;
}

/** The shape tree wrapper every slide-ish part needs. */
function spTree(shapes: string): string {
  return (
    `<p:spTree>` +
    `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
    shapes +
    `</p:spTree>`
  );
}

function slideXml(slide: Slide, index: number): string {
  const title = paragraph(slide.title || `Slide ${index + 1}`);
  const body = slide.lines.length > 0 ? slide.lines.map(paragraph).join("") : EMPTY_PARAGRAPH;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<p:sld xmlns:a="${DML}" xmlns:r="${DOC_RELS}" xmlns:p="${PML}"><p:cSld>` +
    spTree(shape(2, "Title 1", "title", title) + shape(3, "Content 2", "body", body)) +
    `</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  );
}

/** The 12-colour scheme and format lists a theme part must declare. */
function themeXml(): string {
  const colour = (tag: string, value: string): string => `<a:${tag}><a:srgbClr val="${value}"/></a:${tag}>`;
  const fill = `<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>`;
  const line =
    `<a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>` +
    `<a:prstDash val="solid"/></a:ln>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<a:theme xmlns:a="${DML}" name="OneKit"><a:themeElements>` +
    `<a:clrScheme name="OneKit">` +
    `<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>` +
    `<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>` +
    colour("dk2", "44546A") +
    colour("lt2", "E7E6E6") +
    colour("accent1", "4472C4") +
    colour("accent2", "ED7D31") +
    colour("accent3", "A5A5A5") +
    colour("accent4", "FFC000") +
    colour("accent5", "5B9BD5") +
    colour("accent6", "70AD47") +
    colour("hlink", "0563C1") +
    colour("folHlink", "954F72") +
    `</a:clrScheme>` +
    `<a:fontScheme name="OneKit">` +
    `<a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>` +
    `<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>` +
    `</a:fontScheme>` +
    `<a:fmtScheme name="OneKit">` +
    `<a:fillStyleLst>${fill}${fill}${fill}</a:fillStyleLst>` +
    `<a:lnStyleLst>${line}${line}${line}</a:lnStyleLst>` +
    `<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle>` +
    `<a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>` +
    `<a:bgFillStyleLst>${fill}${fill}${fill}</a:bgFillStyleLst>` +
    `</a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`
  );
}

function slideMasterXml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<p:sldMaster xmlns:a="${DML}" xmlns:r="${DOC_RELS}" xmlns:p="${PML}"><p:cSld>` +
    `<p:bg><p:bgPr><a:solidFill><a:schemeClr val="lt1"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>` +
    spTree(
      shape(2, "Title Placeholder 1", "title", EMPTY_PARAGRAPH) +
        shape(3, "Text Placeholder 2", "body", EMPTY_PARAGRAPH)
    ) +
    `</p:cSld>` +
    `<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" ` +
    `accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>` +
    `<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>` +
    `<p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="4000"/></a:lvl1pPr></p:titleStyle>` +
    `<p:bodyStyle><a:lvl1pPr marL="342900" indent="-342900"><a:buChar char="&#8226;"/><a:defRPr sz="2400"/></a:lvl1pPr></p:bodyStyle>` +
    `<p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles>` +
    `</p:sldMaster>`
  );
}

function slideLayoutXml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<p:sldLayout xmlns:a="${DML}" xmlns:r="${DOC_RELS}" xmlns:p="${PML}" type="obj" preserve="1">` +
    `<p:cSld name="Title and Content">` +
    spTree(
      shape(2, "Title 1", "title", EMPTY_PARAGRAPH) +
        shape(3, "Content Placeholder 2", "body", EMPTY_PARAGRAPH)
    ) +
    `</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`
  );
}

/**
 * Builds a complete .pptx from slide text. The package carries every
 * part PowerPoint requires — content types, relationships, a master, a
 * layout and a theme — so the result opens in PowerPoint, Keynote and
 * LibreOffice Impress.
 */
export function buildPptx(slides: Slide[]): Uint8Array {
  const list = slides.length > 0 ? slides : [{ title: "", lines: [] }];
  const files: Record<string, Uint8Array> = {};

  const slideOverrides = list
    .map(
      (_, i) =>
        `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
    )
    .join("");
  files["[Content_Types].xml"] = enc(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>` +
      `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>` +
      `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>` +
      `<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>` +
      slideOverrides +
      `</Types>`
  );
  files["_rels/.rels"] = enc(relsXml([{ id: "rId1", type: "officeDocument", target: "ppt/presentation.xml" }]));

  const slideIds = list.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join("");
  files["ppt/presentation.xml"] = enc(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<p:presentation xmlns:a="${DML}" xmlns:r="${DOC_RELS}" xmlns:p="${PML}">` +
      `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
      `<p:sldIdLst>${slideIds}</p:sldIdLst>` +
      `<p:sldSz cx="${SLIDE_W}" cy="${SLIDE_H}"/><p:notesSz cx="${SLIDE_H}" cy="${SLIDE_W}"/>` +
      `</p:presentation>`
  );
  files["ppt/_rels/presentation.xml.rels"] = enc(
    relsXml([
      { id: "rId1", type: "slideMaster", target: "slideMasters/slideMaster1.xml" },
      ...list.map((_, i) => ({ id: `rId${i + 2}`, type: "slide", target: `slides/slide${i + 1}.xml` })),
      { id: `rId${list.length + 2}`, type: "theme", target: "theme/theme1.xml" }
    ])
  );
  files["ppt/slideMasters/slideMaster1.xml"] = enc(slideMasterXml());
  files["ppt/slideMasters/_rels/slideMaster1.xml.rels"] = enc(
    relsXml([
      { id: "rId1", type: "slideLayout", target: "../slideLayouts/slideLayout1.xml" },
      { id: "rId2", type: "theme", target: "../theme/theme1.xml" }
    ])
  );
  files["ppt/slideLayouts/slideLayout1.xml"] = enc(slideLayoutXml());
  files["ppt/slideLayouts/_rels/slideLayout1.xml.rels"] = enc(
    relsXml([{ id: "rId1", type: "slideMaster", target: "../slideMasters/slideMaster1.xml" }])
  );
  files["ppt/theme/theme1.xml"] = enc(themeXml());
  list.forEach((slide, i) => {
    files[`ppt/slides/slide${i + 1}.xml`] = enc(slideXml(slide, i));
    files[`ppt/slides/_rels/slide${i + 1}.xml.rels`] = enc(
      relsXml([{ id: "rId1", type: "slideLayout", target: "../slideLayouts/slideLayout1.xml" }])
    );
  });
  return zipSync(files);
}
