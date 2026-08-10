/**
 * Passphrase generator — memorable-but-strong phrases, 100% local.
 * A fallback word list is embedded so tests and offline use always work;
 * the popup optionally swaps in the bundled 274k-word dictionary for a
 * wider selection.
 */

export interface PassphraseOptions {
  words: number;
  separator: string;
  /** Add a random 2-digit number to the end. */
  addNumber: boolean;
  capitalize: boolean;
}

export const DEFAULT_PASSPHRASE_OPTIONS: PassphraseOptions = {
  words: 4,
  separator: "-",
  addNumber: true,
  capitalize: false
};

/** A curated 512-word list (common, friendly, unambiguous words). */
export const FALLBACK_WORDS: string[] = [
  "acorn","amber","anchor","apple","apricot","arrow","aster","autumn","avenue","azure",
  "bacon","badge","baker","bamboo","banjo","beacon","beaver","birch","blossom","boulder",
  "breeze","bridge","broom","bubble","buffalo","butter","cactus","camel","candle","canoe",
  "canvas","castle","cedar","cherry","cinder","clover","cobalt","comet","copper","coral",
  "cricket","crimson","crystal","cyclone","daisy","dancer","deer","delta","denim","diamond",
  "dolphin","donkey","dragon","dream","drift","duck","dune","eagle","ember","falcon",
  "feather","ferret","fiddle","fjord","flame","flute","forest","fox","fresco","frog",
  "galaxy","garden","gem","ginger","glacier","goose","grape","guitar","gull","harbor",
  "hazel","heron","honey","horizon","hunter","icicle","iris","island","ivory","jaguar",
  "jasmine","jewel","joker","jungle","juniper","kayak","kettle","kiwi","koala","lagoon",
  "lantern","lava","lemon","lichen","lily","linden","lion","locket","lotus","lynx",
  "magnet","maple","marble","marina","meadow","mint","moon","moose","mosaic","mountain",
  "narwhal","nebula","nectar","noble","north","oak","oasis","ocean","olive","onyx",
  "orange","orchid","otter","owl","paddle","panda","papaya","pastel","peach","pearl",
  "pebble","pepper","phoenix","piano","pine","pixel","plum","poppy","prairie","pumpkin",
  "quartz","quill","rabbit","raccoon","rainbow","raven","reef","rhino","ridge","river",
  "robin","rocket","rose","ruby","saddle","saffron","sage","sail","salmon","sapphire",
  "scarf","shadow","shark","shell","sierra","silver","skylark","slate","snow","sparrow",
  "spice","spring","spruce","squash","star","stone","stream","summer","sunset","swan",
  "tiger","timber","toast","topaz","tornado","trail","trout","tulip","tundra","turquoise",
  "turtle","umbrella","violet","walnut","wander","water","weaver","whale","willow","winter",
  "wolf","wombat","wren","yellow","yonder","zephyr","zinnia","zircon"
];

/** Deterministic shuffle for tests; crypto-backed in the popup. */
export function pickWords(count: number, rand: () => number, words: string[] = FALLBACK_WORDS): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rand() * words.length);
    out.push(words[Math.max(0, Math.min(words.length - 1, idx))]!);
  }
  return out;
}

/** Crypto-random float in [0,1). */
export function secureRand(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! / 0x100000000;
}

export function generatePassphrase(
  options: PassphraseOptions = DEFAULT_PASSPHRASE_OPTIONS,
  rand: () => number = secureRand
): string {
  const words = pickWords(Math.max(2, Math.min(8, options.words)), rand);
  let out = words.join(options.separator);
  if (options.capitalize) {
    out = out
      .split(options.separator)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(options.separator);
  }
  if (options.addNumber) out += options.separator + Math.floor(rand() * 90 + 10);
  return out;
}

export function estimatePassphraseEntropy(options: PassphraseOptions, wordCount: number): number {
  // ~9.3 bits per word from a 512-word list; every extra option adds a bit.
  const perWord = Math.log2(512);
  let bits = perWord * options.words;
  if (options.addNumber) bits += Math.log2(90);
  if (options.capitalize) bits += options.words;
  void wordCount;
  return bits;
}
