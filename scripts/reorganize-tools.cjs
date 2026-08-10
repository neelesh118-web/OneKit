/* One-time organizer: reorder popup tool blocks into logical groups and
 * insert visible group headers. Operates only on the block boundaries —
 * block internals are never touched, so wiring stays intact. */
const fs = require("fs");

const FILE = "entrypoints/popup/index.html";
let html = fs.readFileSync(FILE, "utf8");

const MARKER = '        <div class="tool-block">';
const GROUP = (title) => `\n        <div class="tool-group">${title}</div>\n`;

const ORDER = {
  memory: [
    ["🔎 Search & clipboard", ["🔎 Full-text history search", "📋 Clipboard history", "📎 Clipboard export", "📝 Form draft vault"]],
    ["⭐ Saved content", ["⭐ Highlights", "🧹 Highlight exporter", "📚 Read later", "🎲 Random revisit", "🏷 Auto-tag saved content", "⏱️ Reading time &amp; grade level"]],
    ["📦 Archives & autofill", ["📦 Local web archive", "🗒️ Sticky web notes", "🔑 Contact card (autofill)"]],
    ["⏰ Sessions & reminders", ["⏰ Local reminders", "🅿️ Tab parking", "⏰ Scheduled session opens", "🗂 Session export / import", "🔗 Link collector"]],
    ["🎙 Meetings & activity", ["🎙 Meeting link launcher", "🧹 Activity log"]]
  ],
  safety: [
    ["🧼 Page cleaning", ["🧹 Clean Link", "🍪 Cookie banner auto-reject", "🍪 Cookie manager", "🔒 PII redactor", "📮 Email-signup blocker"]],
    ["🚨 Threat radar", ["🚨 Scam-site radar"]],
    ["🔐 Credentials", ["🔐 TOTP 2FA authenticator", "🔑 Local password vault", "🛡 Vault health report", "🧽 Privacy sweep"]],
    ["🧘 Privacy", ["🔐 Privacy score", "🔐 Encrypted text locker"]]
  ],
  speed: [
    ["🗂 Tab management", ["🔁 Duplicate tab killer", "🔍 Tab finder", "🛑 Tab limiter", "💾 Tab memory saver", "⏰ Tab snooze", "🗃 Auto tab grouping", "📋 Copy tab list"]],
    ["🧭 Sessions & playback", ["🗂 Tab workspaces", "🛟 Automatic session backup", "🔇 Autoplay killer", "🔄 Tab auto-refresh"]]
  ],
  focus: [
    ["🚫 Blocks & limits", ["🧘 Distraction blocker", "🎯 Focus session", "⏳ Daily site budgets", "⏱ Screen time"]],
    ["⏱ Routines", ["🍅 Pomodoro timer", "✅ Habit tracker", "☑️ Todo list", "🌊 Focus sounds"]],
    ["📖 Reading & breaks", ["⏱ Video timestamp notes", "📖 Speed reader", "🧘 Break & stretch reminders"]]
  ],
  tools: [
    ["🎨 Generators", ["🔳 QR generator", "🔑 Password generator", "🧩 Passphrase generator", "〰️ Barcode generator", "📚 Citation generator"]],
    ["🧮 Math, units & color", ["🔢 Calculator", "📐 Unit &amp; date converter", "📅 Date &amp; time tools", "🧾 Price-with-fees calculator", "🎨 Color picker", "🎨 WCAG contrast checker"]],
    ["🎬 Media", ["📸 Screenshots", "✏️ Screenshot annotate", "🖼️ Download all images", "⏩ Video speed controller", "🎬 Tab recorder", "📺 Floating video (PiP)", "🔍 Image &amp; screenshot OCR"]],
    ["🧰 Browser helpers", ["🔖 Bookmark cleaner", "🗃️ Bookmarks → Markdown", "📄 Page → PDF", "🗑️ Downloads cleaner", "🌐 Multi-search"]],
    ["📄 Page content", ["📊 Table → CSV extractor", "📝 Local TL;DR", "📑 Page table of contents", "📐 Size chart switcher", "📧 Contact extractor", "🕵️ QR scanner", "🖼 EXIF viewer"]],
    ["🔑 Password tools", ["🛡️ Password strength analyzer"]]
  ],
  dev: [
    ["🛠️ Developer utilities", ["🛠️ Text &amp; dev toolbox", "💾 Local Storage inspector", "🧪 API tester", "🔎 Link status inspector"]],
    ["🖱️ On-page tools", ["📐 Window resizer", "📏 Page ruler", "🎭 Fake form filler", "🔌 Custom CSS per site"]]
  ]
};

function labelOf(chunk) {
  const m = chunk.match(/tool-label">([^<]+)<\/span>/);
  return m ? m[1] : null;
}

let failures = 0;
for (const [panelId, groups] of Object.entries(ORDER)) {
  const sectionRe = new RegExp(`<section class="tab-panel" id="panel-${panelId}"[^>]*>`);
  const secMatch = sectionRe.exec(html);
  if (!secMatch) {
    console.error(`panel ${panelId}: section not found`);
    failures++;
    continue;
  }
  const secStart = secMatch.index;
  const bodyStart = secStart + secMatch[0].length;
  const bodyEnd = html.indexOf("</section>", bodyStart);
  if (bodyEnd < 0) {
    console.error(`panel ${panelId}: no </section>`);
    failures++;
    continue;
  }
  const body = html.slice(bodyStart, bodyEnd);

  // Split into header prefix + blocks (each block begins with MARKER).
  const parts = body.split(MARKER);
  const prefix = parts.shift();
  const blocks = parts.map((p) => MARKER + p);
  const byLabel = new Map();
  for (const block of blocks) {
    const label = labelOf(block);
    if (!label) {
      console.error(`panel ${panelId}: block with no label`);
      failures++;
      continue;
    }
    if (byLabel.has(label)) {
      console.error(`panel ${panelId}: duplicate label "${label}"`);
      failures++;
    }
    byLabel.set(label, block);
  }

  // Coverage check: every map label must exist, and every block must be used.
  const declared = groups.flatMap(([, labels]) => labels);
  for (const label of declared) {
    if (!byLabel.has(label)) {
      console.error(`panel ${panelId}: map label missing from HTML: "${label}"`);
      failures++;
    }
  }
  for (const label of byLabel.keys()) {
    if (!declared.includes(label)) {
      console.error(`panel ${panelId}: HTML block not in map: "${label}"`);
      failures++;
    }
  }

  let rebuilt = prefix;
  for (const [title, labels] of groups) {
    rebuilt += GROUP(title);
    for (const label of labels) rebuilt += byLabel.get(label);
  }
  // Preserve the trailing whitespace that used to sit before </section>.
  const tailMatch = body.match(/(\s+)$/);
  if (tailMatch) rebuilt += tailMatch[1];

  html = html.slice(0, bodyStart) + rebuilt + html.slice(bodyEnd);
  console.log(`panel ${panelId}: reordered (${declared.length} blocks, ${groups.length} groups)`);
}

if (failures > 0) {
  console.error(`\n${failures} problem(s) — nothing written.`);
  process.exit(1);
}
fs.writeFileSync(FILE, html);
console.log("\nWritten:", FILE);
