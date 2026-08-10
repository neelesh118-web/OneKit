/* One-time inserter for the 12-tool round: adds each new tool block right
 * after its anchor block (matched by tool-label). Blocks end at the next
 * 8-space-indented `</div>` after the label. */
const fs = require("fs");

const FILE = "entrypoints/popup/index.html";
let html = fs.readFileSync(FILE, "utf8");

const block = (label, hint, body) =>
  `        <div class="tool-block">\n` +
  `          <div class="tool-heading">\n` +
  `            <span class="tool-label">${label}</span>\n` +
  `          </div>\n` +
  `          <p class="hint">${hint}</p>\n` +
  body +
  `        </div>\n`;

const INSERTS = [
  {
    after: "📋 Copy tab list",
    blocks: [
      block(
        "🗂 Tab utilities",
        "Tab hygiene in one place: close tabs to the left/right/others of the active tab, sort the window by domain, or merge every window into this one. Pinned tabs are never closed.",
        `          <div class="btn-row">\n` +
        `            <button id="tu-left" type="button" class="mini-btn">Close left</button>\n` +
        `            <button id="tu-right" type="button" class="mini-btn">Close right</button>\n` +
        `            <button id="tu-others" type="button" class="mini-btn">Close others</button>\n` +
        `          </div>\n` +
        `          <div class="btn-row">\n` +
        `            <button id="tu-sort" type="button" class="mini-btn">Sort by domain</button>\n` +
        `            <button id="tu-merge" type="button" class="mini-btn">Merge windows</button>\n` +
        `          </div>\n` +
        `          <p id="tu-status" class="status"></p>\n`
      ),
      block(
        "🕘 Recently closed tabs",
        "Your recently closed tabs as a one-click list — no more cycling through Ctrl+Shift+T to find the one you lost.",
        `          <div class="btn-row">\n` +
        `            <button id="rc-refresh" type="button" class="mini-btn">Refresh</button>\n` +
        `          </div>\n` +
        `          <div id="rc-list" class="results"></div>\n` +
        `          <p id="rc-status" class="status"></p>\n`
      )
    ]
  },
  {
    after: "🧘 Break & stretch reminders",
    blocks: [
      block(
        "🔊 Read aloud + Reader view",
        "Read the page with the browser's own voices, or open it in OneKit's clean, distraction-free Reader view.",
        `          <div class="btn-row">\n` +
        `            <button id="ra-read" type="button" class="mini-btn primary">▶ Read page aloud</button>\n` +
        `            <button id="ra-stop" type="button" class="mini-btn danger">Stop</button>\n` +
        `            <button id="ra-reader" type="button" class="mini-btn">Open in Reader view</button>\n` +
        `          </div>\n` +
        `          <p id="ra-status" class="status"></p>\n`
      ),
      block(
        "📏 Reading line",
        "A thin line follows your cursor while you read — an accessibility staple for keeping your place on long pages.",
        `          <div class="btn-row">\n` +
        `            <input id="rl-thickness" type="number" min="1" max="8" value="2" aria-label="Line thickness px" />\n` +
        `            <button id="rl-toggle" type="button" class="mini-btn">Toggle reading line</button>\n` +
        `          </div>\n` +
        `          <p id="rl-status" class="status"></p>\n`
      )
    ]
  },
  {
    after: "⬇️ Copy as Markdown",
    blocks: [
      block(
        "🔗 Copy page link",
        "This page's title + URL in the three formats you actually paste into: Markdown, HTML, and plain text.",
        `          <div class="btn-row">\n` +
        `            <button id="clk-md" type="button" class="mini-btn">Copy as Markdown</button>\n` +
        `            <button id="clk-html" type="button" class="mini-btn">Copy as HTML</button>\n` +
        `            <button id="clk-plain" type="button" class="mini-btn">Copy as plain text</button>\n` +
        `          </div>\n` +
        `          <p id="clk-status" class="status"></p>\n`
      )
    ]
  },
  {
    after: "✍️ Local spell-checker",
    blocks: [
      block(
        "📖 Dictionary lookup",
        "Look up any word in the offline dictionary — part of speech plus a plain-English definition, no network.",
        `          <div class="btn-row">\n` +
        `            <input id="dict-input" type="text" placeholder=\"Type a word…\" autocomplete="off" />\n` +
        `            <button id="dict-lookup" type="button" class="mini-btn primary">Look up</button>\n` +
        `          </div>\n` +
        `          <div id="dict-result" class="results"></div>\n` +
        `          <p id="dict-status" class="status"></p>\n`
      )
    ]
  },
  {
    after: "📚 Citation generator",
    blocks: [
      block(
        "🎰 Generator pack",
        "Four micro-generators: UUID v4, lorem ipsum, a pronounceable username, and a HEX/RGB/HSL color converter.",
        `          <div class="btn-row">\n` +
        `            <button id="gen-uuid" type="button" class="mini-btn">UUID</button>\n` +
        `            <button id="gen-lorem" type="button" class="mini-btn">Lorem ipsum</button>\n` +
        `            <button id="gen-user" type="button" class="mini-btn">Username</button>\n` +
        `          </div>\n` +
        `          <div class=\"btn-row\">\n` +
        `            <input id=\"gen-color\" type=\"text\" placeholder=\"#ff0000\" value=\"#ff0000\" autocomplete=\"off\" />\n` +
        `            <button id=\"gen-color-btn\" type=\"button\" class=\"mini-btn\">Convert color</button>\n` +
        `          </div>\n` +
        `          <div id=\"gen-output\" class=\"results\"></div>\n` +
        `          <p id=\"gen-status\" class=\"status\"></p>\n`
      )
    ]
  },
  {
    after: "🌐 Multi-search",
    blocks: [
      block(
        "🧪 UTM link builder",
        "Append campaign tracking params to any URL — source, medium, campaign, term, content. Old utm_ params are replaced, everything else is kept.",
        `          <div class=\"btn-row\">\n` +
        `            <input id=\"utm-url\" type=\"text\" placeholder=\"https://example.com/page\" autocomplete=\"off\" />\n` +
        `          </div>\n` +
        `          <div class=\"btn-row\">\n` +
        `            <input id=\"utm-source\" type=\"text\" placeholder=\"source (newsletter)\" />\n` +
        `            <input id=\"utm-medium\" type=\"text\" placeholder=\"medium (email)\" />\n` +
        `            <input id=\"utm-campaign\" type=\"text\" placeholder=\"campaign (launch)\" />\n` +
        `          </div>\n` +
        `          <div class=\"btn-row\">\n` +
        `            <input id=\"utm-term\" type=\"text\" placeholder=\"term (optional)\" />\n` +
        `            <input id=\"utm-content\" type=\"text\" placeholder=\"content (optional)\" />\n` +
        `            <button id=\"utm-build\" type=\"button\" class=\"mini-btn primary\">Build & copy</button>\n` +
        `          </div>\n` +
        `          <p id=\"utm-status\" class=\"status\"></p>\n`
      ),
      block(
        "🖼 Favicon extractor",
        "Save any page's icon — resolved from its <link> tags with a /favicon.ico fallback, fetched locally.",
        `          <div class=\"btn-row\">\n` +
        `            <button id=\"fv-save\" type=\"button\" class=\"mini-btn\">Save this page's icon</button>\n` +
        `          </div>\n` +
        `          <p id=\"fv-status\" class=\"status\"></p>\n`
      )
    ]
  },
  {
    after: "📧 Contact extractor",
    blocks: [
      block(
        "🌐 Open all links",
        "Open every link on the page in background tabs (capped at 25) — jump straight into a research session.",
        `          <div class=\"btn-row\">\n` +
        `            <button id=\"ol-open\" type=\"button\" class=\"mini-btn primary\">Open all links on this page</button>\n` +
        `          </div>\n` +
        `          <p id=\"ol-status\" class=\"status\"></p>\n`
      )
    ]
  },
  {
    after: "🔎 Link status inspector",
    blocks: [
      block(
        "🔎 Page meta inspector",
        "Title, meta description, Open Graph tags, canonical, and H1s — the SEO quick-check, straight from the DOM.",
        `          <div class=\"btn-row\">\n` +
        `            <button id=\"pm-inspect\" type=\"button\" class=\"mini-btn\">Inspect this page</button>\n` +
        `            <button id=\"pm-copy\" type=\"button\" class=\"mini-btn\">Copy as Markdown</button>\n` +
        `          </div>\n` +
        `          <div id=\"pm-list\" class=\"results\"></div>\n` +
        `          <p id=\"pm-status\" class=\"status\"></p>\n`
      ),
      block(
        "🧪 Bulk link checker",
        "Paste a list of URLs (one per line) and check each one — broken and redirecting links flagged in seconds.",
        `          <textarea id=\"lc-input\" rows=\"4\" placeholder=\"https://example.com&#10;https://example.org/page\"></textarea>\n` +
        `          <div class=\"btn-row\">\n` +
        `            <button id=\"lc-run\" type=\"button\" class=\"mini-btn primary\">Check links</button>\n` +
        `          </div>\n` +
        `          <div id=\"lc-list\" class=\"results\"></div>\n` +
        `          <p id=\"lc-status\" class=\"status\"></p>\n`
      )
    ]
  }
];

let failures = 0;
for (const insert of INSERTS) {
  const anchorPos = html.indexOf(`<span class="tool-label">${insert.after}</span>`);
  if (anchorPos < 0) {
    console.error(`anchor not found: ${insert.after}`);
    failures++;
    continue;
  }
  // End of the anchor's block = next 8-space-indented </div>.
  const blockEnd = html.indexOf("\n        </div>", anchorPos);
  if (blockEnd < 0) {
    console.error(`block end not found for: ${insert.after}`);
    failures++;
    continue;
  }
  const insertAt = blockEnd + "\n        </div>".length;
  const chunk = "\n" + insert.blocks.join("\n");
  html = html.slice(0, insertAt) + chunk + html.slice(insertAt);
  console.log(`inserted ${insert.blocks.length} block(s) after ${insert.after}`);
}

if (failures > 0) {
  console.error(`${failures} problem(s) — nothing written.`);
  process.exit(1);
}
fs.writeFileSync(FILE, html);
console.log("\nWritten:", FILE);
