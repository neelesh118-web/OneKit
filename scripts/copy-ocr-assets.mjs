/**
 * Copies the tesseract.js offline assets into public/tesseract/ so the OCR
 * tool never touches the network: the worker script, the WASM core (JS
 * loader + .wasm), and the English traineddata (best-int, ~2.9 MB).
 * Runs automatically before build/zip via npm's pre-scripts.
 */
import { cpSync, mkdirSync, existsSync } from "node:fs";

const dest = "public/tesseract";
mkdirSync(dest, { recursive: true });

const sources = [
  ["node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract-core-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm", "tesseract-core-lstm.wasm"],
  ["node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "eng.traineddata.gz"]
];

let copied = 0;
for (const [src, name] of sources) {
  if (!existsSync(src)) {
    console.error(`Missing ${src} — run npm install first.`);
    process.exit(1);
  }
  cpSync(src, `${dest}/${name}`);
  copied += 1;
}

// Spell-checker wordlist (274k words) — shipped as a static file and fetched
// only when the spell-checker runs, so it never bloats the popup boot bundle.
mkdirSync("public/dictionary", { recursive: true });
const wordlistSrc = "node_modules/an-array-of-english-words/index.json";
if (!existsSync(wordlistSrc)) {
  console.error(`Missing ${wordlistSrc} — run npm install first.`);
  process.exit(1);
}
cpSync(wordlistSrc, "public/dictionary/words.json");
copied += 1;

console.log(`Offline assets copied: ${copied} files → public/tesseract/ + public/dictionary/`);
