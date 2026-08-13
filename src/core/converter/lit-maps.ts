/**
 * Microsoft LIT binary-HTML tag and attribute tables, faithfully ported from
 * calibre's `lit/maps/html.py` (itself copied from ConvertLIT). The LIT
 * "UnBinary" format stores every tag/attribute as a numeric code; these
 * tables decode those codes back into HTML.
 */
export const LIT_TAGS: (string | null)[] = [
  null, null, null,
  "a", "acronym", "address", "applet", "area", "b", "base", "basefont", "bdo",
  "bgsound", "big", "blink", "blockquote", "body", "br", "button", "caption",
  "center", "cite", "code", "col", "colgroup", null, null, "dd", "del", "dfn",
  "dir", "div", "dl", "dt", "em", "embed", "fieldset", "font", "form", "frame",
  "frameset", null, "h1", "h2", "h3", "h4", "h5", "h6", "head", "hr", "html",
  "i", "iframe", "img", "input", "ins", "kbd", "label", "legend", "li", "link",
  "tag61", "map", "tag63", "tag64", "meta", "nextid", "nobr", "noembed",
  "noframes", "noscript", "object", "ol", "option", "p", "param", "plaintext",
  "pre", "q", "rp", "rt", "ruby", "s", "samp", "script", "select", "small",
  "span", "strike", "strong", "style", "sub", "sup", "table", "tbody", "tc",
  "td", "textarea", "tfoot", "th", "thead", "title", "tr", "tt", "u", "ul",
  "var", "wbr", null
];

/** Global attributes (valid on every tag). */
export const LIT_ATTRS0: Record<number, string> = {
  0x8010: "tabindex", 0x8046: "title", 0x804b: "style", 0x804d: "disabled",
  0x83ea: "class", 0x83eb: "id", 0x83fe: "datafld", 0x83ff: "datasrc",
  0x8400: "dataformatas", 0x87d6: "accesskey", 0x9392: "lang", 0x93ed: "language",
  0x93fe: "dir", 0x9771: "onmouseover", 0x9772: "onmouseout", 0x9773: "onmousedown",
  0x9774: "onmouseup", 0x9775: "onmousemove", 0x9776: "onkeydown", 0x9777: "onkeyup",
  0x9778: "onkeypress", 0x9779: "onclick", 0x977a: "ondblclick", 0x977e: "onhelp",
  0x977f: "onfocus", 0x9780: "onblur", 0x9783: "onrowexit", 0x9784: "onrowenter",
  0x9786: "onbeforeupdate", 0x9787: "onafterupdate", 0x978a: "onreadystatechange",
  0x9790: "onscroll", 0x9794: "ondragstart", 0x9795: "onresize", 0x9796: "onselectstart",
  0x9797: "onerrorupdate", 0x9799: "ondatasetchanged", 0x979a: "ondataavailable",
  0x979b: "ondatasetcomplete", 0x979c: "onfilterchange", 0x979f: "onlosecapture",
  0x97a0: "onpropertychange", 0x97a2: "ondrag", 0x97a3: "ondragend", 0x97a4: "ondragenter",
  0x97a5: "ondragover", 0x97a6: "ondragleave", 0x97a7: "ondrop", 0x97a8: "oncut",
  0x97a9: "oncopy", 0x97aa: "onpaste", 0x97ab: "onbeforecut", 0x97ac: "onbeforecopy",
  0x97ad: "onbeforepaste", 0x97af: "onrowsdelete", 0x97b0: "onrowsinserted",
  0x97b1: "oncellchange", 0x97b2: "oncontextmenu", 0x97b6: "onbeforeeditfocus"
};

const A = (...pairs: [number, string][]): Record<number, string> =>
  Object.fromEntries(pairs);

/** Per-tag attribute tables, indexed the same way as LIT_TAGS. */
export const LIT_TAGS_ATTRS: (Record<number, string> | null)[] = [
  null, null, null,
  A([0x0001, "href"], [0x03ec, "target"], [0x03ee, "rel"], [0x03ef, "rev"], [0x03f0, "urn"], [0x03f1, "methods"], [0x8001, "name"], [0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"]), // a
  null, // acronym
  A([0x9399, "clear"]), // address
  A([0x8001, "name"], [0x8006, "width"], [0x8007, "height"], [0x804a, "align"], [0x8bbb, "classid"], [0x8bbc, "data"], [0x8bbf, "codebase"], [0x8bc0, "codetype"], [0x8bc1, "code"], [0x8bc2, "type"], [0x8bc5, "vspace"], [0x8bc6, "hspace"], [0x978e, "onerror"]), // applet
  A([0x0001, "href"], [0x03ea, "shape"], [0x03eb, "coords"], [0x03ed, "target"], [0x03ee, "alt"], [0x03ef, "nohref"], [0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"]), // area
  A([0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"]), // b
  A([0x03ec, "href"], [0x03ed, "target"]), // base
  A([0x938b, "color"], [0x939b, "face"], [0x93a3, "size"]), // basefont
  null, // bdo
  A([0x03ea, "src"], [0x03eb, "loop"], [0x03ec, "volume"], [0x03ed, "balance"]), // bgsound
  A([0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"]), // big
  null, // blink
  A([0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"], [0x9399, "clear"]), // blockquote
  A([0x07db, "link"], [0x07dc, "alink"], [0x07dd, "vlink"], [0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"], [0x938a, "background"], [0x938b, "text"], [0x938e, "nowrap"], [0x93ae, "topmargin"], [0x93af, "rightmargin"], [0x93b0, "bottommargin"], [0x93b1, "leftmargin"], [0x93b6, "bgproperties"], [0x93d8, "scroll"], [0x977b, "onselect"], [0x9791, "onload"], [0x9792, "onunload"], [0x9798, "onbeforeunload"], [0x97b3, "onbeforeprint"], [0x97b4, "onafterprint"], [0xfe0c, "bgcolor"]), // body
  A([0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"], [0x9399, "clear"]), // br
  A([0x07d1, "type"], [0x8001, "name"]), // button
  A([0x8046, "title"], [0x8049, "align"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"], [0x93a8, "valign"]), // caption
  A([0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"], [0x9399, "clear"]), // center
  A([0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"]), // cite
  A([0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"]), // code
  A([0x03ea, "span"], [0x8006, "width"], [0x8049, "align"], [0x93a8, "valign"], [0xfe0c, "bgcolor"]), // col
  A([0x03ea, "span"], [0x8006, "width"], [0x8049, "align"], [0x93a8, "valign"], [0xfe0c, "bgcolor"]), // colgroup
  null, null,
  A([0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"], [0x938e, "nowrap"]), // dd
  null, // del
  A([0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"]), // dfn
  null, // dir
  A([0x8046, "title"], [0x8049, "align"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"], [0x938e, "nowrap"]), // div
  A([0x03ea, "compact"], [0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"]), // dl
  A([0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"], [0x938e, "nowrap"]), // dt
  A([0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"]), // em
  A([0x8001, "name"], [0x8006, "width"], [0x8007, "height"], [0x804a, "align"], [0x8bbd, "palette"], [0x8bbe, "pluginspage"], [0x8bbf, "src"], [0x8bc1, "units"], [0x8bc2, "type"], [0x8bc3, "hidden"]), // embed
  A([0x804a, "align"]), // fieldset
  A([0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"], [0x938b, "color"], [0x939b, "face"], [0x939c, "size"]), // font
  A([0x03ea, "action"], [0x03ec, "enctype"], [0x03ed, "method"], [0x03ef, "target"], [0x03f4, "accept-charset"], [0x8001, "name"], [0x977c, "onsubmit"], [0x977d, "onreset"]), // form
  A([0x8000, "align"], [0x8001, "name"], [0x8bb9, "src"], [0x8bbb, "border"], [0x8bbc, "frameborder"], [0x8bbd, "framespacing"], [0x8bbe, "marginwidth"], [0x8bbf, "marginheight"], [0x8bc0, "noresize"], [0x8bc1, "scrolling"], [0x8fa2, "bordercolor"]), // frame
  A([0x03e9, "rows"], [0x03ea, "cols"], [0x03eb, "border"], [0x03ec, "bordercolor"], [0x03ed, "frameborder"], [0x03ee, "framespacing"], [0x8001, "name"], [0x9791, "onload"], [0x9792, "onunload"], [0x9798, "onbeforeunload"], [0x97b3, "onbeforeprint"], [0x97b4, "onafterprint"]), // frameset
  null,
  A([0x8046, "title"], [0x8049, "align"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"], [0x9399, "clear"]), // h1
  A([0x8046, "title"], [0x8049, "align"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"], [0x9399, "clear"]), // h2
  A([0x8046, "title"], [0x8049, "align"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"], [0x9399, "clear"]), // h3
  A([0x8046, "title"], [0x8049, "align"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"], [0x9399, "clear"]), // h4
  A([0x8046, "title"], [0x8049, "align"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"], [0x9399, "clear"]), // h5
  A([0x8046, "title"], [0x8049, "align"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"], [0x9399, "clear"]), // h6
  null, // head
  A([0x03ea, "noshade"], [0x8006, "width"], [0x8007, "size"], [0x8046, "title"], [0x8049, "align"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"], [0x938b, "color"]), // hr
  null, // html
  A([0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"]), // i
  A([0x8001, "name"], [0x8006, "width"], [0x8007, "height"], [0x804a, "align"], [0x8bb9, "src"], [0x8bbb, "border"], [0x8bbc, "frameborder"], [0x8bbd, "framespacing"], [0x8bbe, "marginwidth"], [0x8bbf, "marginheight"], [0x8bc0, "noresize"], [0x8bc1, "scrolling"], [0x8fa2, "vspace"], [0x8fa3, "hspace"]), // iframe
  A([0x03eb, "alt"], [0x03ec, "src"], [0x03ed, "border"], [0x03ee, "vspace"], [0x03ef, "hspace"], [0x03f0, "lowsrc"], [0x03f1, "vrml"], [0x03f2, "dynsrc"], [0x03f4, "loop"], [0x03f6, "start"], [0x07d3, "ismap"], [0x07d9, "usemap"], [0x8001, "name"], [0x8006, "width"], [0x8007, "height"], [0x8046, "title"], [0x804a, "align"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"], [0x978d, "onabort"], [0x978e, "onerror"], [0x9791, "onload"]), // img
  A([0x07d1, "type"], [0x07d3, "size"], [0x07d4, "maxlength"], [0x07d6, "readonly"], [0x07d8, "indeterminate"], [0x07da, "checked"], [0x07db, "alt"], [0x07dc, "src"], [0x07dd, "border"], [0x07de, "vspace"], [0x07df, "hspace"], [0x07e0, "lowsrc"], [0x07e1, "vrml"], [0x07e2, "dynsrc"], [0x07e4, "loop"], [0x07e5, "start"], [0x8001, "name"], [0x8006, "width"], [0x8007, "height"], [0x804a, "align"], [0x93ee, "value"], [0x977b, "onselect"], [0x978d, "onabort"], [0x978e, "onerror"], [0x978f, "onchange"], [0x9791, "onload"]), // input
  null, // ins
  A([0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"]), // kbd
  A([0x03e9, "for"]), // label
  A([0x804a, "align"]), // legend
  A([0x03ea, "value"], [0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"], [0x939a, "type"]), // li
  A([0x03ee, "href"], [0x03ef, "rel"], [0x03f0, "rev"], [0x03f1, "type"], [0x03f9, "media"], [0x03fa, "target"], [0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"], [0x978e, "onerror"], [0x9791, "onload"]), // link
  A([0x9399, "clear"]), // tag61
  A([0x8001, "name"], [0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"]), // map
  A([0x1771, "scrolldelay"], [0x1772, "direction"], [0x1773, "behavior"], [0x1774, "scrollamount"], [0x1775, "loop"], [0x1776, "vspace"], [0x1777, "hspace"], [0x1778, "truespeed"], [0x8006, "width"], [0x8007, "height"], [0x9785, "onbounce"], [0x978b, "onfinish"], [0x978c, "onstart"], [0xfe0c, "bgcolor"]), // tag63
  null, // tag64
  A([0x03ea, "http-equiv"], [0x03eb, "content"], [0x03ec, "url"], [0x03f6, "charset"], [0x8001, "name"]), // meta
  A([0x03f5, "n"]), // nextid
  null, null, null, null, // nobr, noembed, noframes, noscript
  A([0x8000, "usemap"], [0x8001, "name"], [0x8006, "width"], [0x8007, "height"], [0x8046, "title"], [0x804a, "align"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"], [0x8bbb, "classid"], [0x8bbc, "data"], [0x8bbf, "codebase"], [0x8bc0, "codetype"], [0x8bc1, "code"], [0x8bc2, "type"], [0x8bc5, "vspace"], [0x8bc6, "hspace"], [0x978e, "onerror"]), // object
  A([0x03eb, "compact"], [0x03ec, "start"], [0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"], [0x939a, "type"]), // ol
  A([0x03ea, "selected"], [0x03eb, "value"]), // option
  A([0x8046, "title"], [0x8049, "align"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"], [0x9399, "clear"]), // p
  A([0x8000, "type"]), // param
  A([0x9399, "clear"]), // plaintext
  A([0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"], [0x9399, "clear"]), // pre
  A([0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"]), // q
  null, null, null, // rp, rt, ruby
  A([0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"]), // s
  A([0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"]), // samp
  A([0x03ea, "src"], [0x03ed, "for"], [0x03ee, "event"], [0x03f0, "defer"], [0x03f2, "type"], [0x978e, "onerror"]), // script
  A([0x03eb, "size"], [0x03ec, "multiple"], [0x8000, "align"], [0x8001, "name"], [0x978f, "onchange"]), // select
  A([0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"]), // small
  A([0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"]), // span
  A([0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"]), // strike
  A([0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"]), // strong
  A([0x03eb, "type"], [0x03ef, "media"], [0x8046, "title"], [0x978e, "onerror"], [0x9791, "onload"]), // style
  A([0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"]), // sub
  A([0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"]), // sup
  A([0x03ea, "cols"], [0x03eb, "border"], [0x03ec, "rules"], [0x03ed, "frame"], [0x03ee, "cellspacing"], [0x03ef, "cellpadding"], [0x03fa, "datapagesize"], [0x8006, "width"], [0x8007, "height"], [0x8046, "title"], [0x804a, "align"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"], [0x938a, "background"], [0x93a5, "bordercolor"], [0x93a6, "bordercolorlight"], [0x93a7, "bordercolordark"], [0xfe0c, "bgcolor"]), // table
  A([0x8049, "align"], [0x93a8, "valign"], [0xfe0c, "bgcolor"]), // tbody
  A([0x8049, "align"], [0x93a8, "valign"]), // tc
  A([0x07d2, "rowspan"], [0x07d3, "colspan"], [0x8006, "width"], [0x8007, "height"], [0x8046, "title"], [0x8049, "align"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"], [0x938a, "background"], [0x938e, "nowrap"], [0x93a5, "bordercolor"], [0x93a6, "bordercolorlight"], [0x93a7, "bordercolordark"], [0x93a8, "valign"], [0xfe0c, "bgcolor"]), // td
  A([0x1b5a, "rows"], [0x1b5b, "cols"], [0x1b5c, "wrap"], [0x1b5d, "readonly"], [0x8001, "name"], [0x977b, "onselect"], [0x978f, "onchange"]), // textarea
  A([0x8049, "align"], [0x93a8, "valign"], [0xfe0c, "bgcolor"]), // tfoot
  A([0x07d2, "rowspan"], [0x07d3, "colspan"], [0x8006, "width"], [0x8007, "height"], [0x8046, "title"], [0x8049, "align"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"], [0x938a, "background"], [0x938e, "nowrap"], [0x93a5, "bordercolor"], [0x93a6, "bordercolorlight"], [0x93a7, "bordercolordark"], [0x93a8, "valign"], [0xfe0c, "bgcolor"]), // th
  A([0x8049, "align"], [0x93a8, "valign"], [0xfe0c, "bgcolor"]), // thead
  null, // title
  A([0x8007, "height"], [0x8046, "title"], [0x8049, "align"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"], [0x93a5, "bordercolor"], [0x93a6, "bordercolorlight"], [0x93a7, "bordercolordark"], [0x93a8, "valign"], [0xfe0c, "bgcolor"]), // tr
  A([0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"]), // tt
  A([0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"]), // u
  A([0x03eb, "compact"], [0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"], [0x939a, "type"]), // ul
  A([0x8046, "title"], [0x804b, "style"], [0x83ea, "class"], [0x83eb, "id"]), // var
  null, // wbr
  null
];
