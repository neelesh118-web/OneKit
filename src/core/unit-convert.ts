/**
 * Unit converter (length / weight / temperature / data / volume / time) and
 * small date-time utilities (diff, add days, timezone formatting). All pure
 * math — no network, no cloud. Currency is deliberately absent: live rates
 * need a network call, which breaks the 100%-local rule.
 */

export type UnitCategory = "length" | "weight" | "temperature" | "data" | "volume" | "time";

interface UnitDef {
  symbol: string;
  /** Factor to the category's base unit (temperature handled specially). */
  factor: number;
  label: string;
}

const UNITS: Record<UnitCategory, Record<string, UnitDef>> = {
  length: {
    mm: { symbol: "mm", factor: 0.001, label: "Millimetre" },
    cm: { symbol: "cm", factor: 0.01, label: "Centimetre" },
    m: { symbol: "m", factor: 1, label: "Metre" },
    km: { symbol: "km", factor: 1000, label: "Kilometre" },
    in: { symbol: "in", factor: 0.0254, label: "Inch" },
    ft: { symbol: "ft", factor: 0.3048, label: "Foot" },
    yd: { symbol: "yd", factor: 0.9144, label: "Yard" },
    mi: { symbol: "mi", factor: 1609.344, label: "Mile" }
  },
  weight: {
    mg: { symbol: "mg", factor: 0.000001, label: "Milligram" },
    g: { symbol: "g", factor: 0.001, label: "Gram" },
    kg: { symbol: "kg", factor: 1, label: "Kilogram" },
    t: { symbol: "t", factor: 1000, label: "Tonne" },
    oz: { symbol: "oz", factor: 0.028349523125, label: "Ounce" },
    lb: { symbol: "lb", factor: 0.45359237, label: "Pound" },
    st: { symbol: "st", factor: 6.35029318, label: "Stone" }
  },
  temperature: {
    c: { symbol: "°C", factor: 1, label: "Celsius" },
    f: { symbol: "°F", factor: 1, label: "Fahrenheit" },
    k: { symbol: "K", factor: 1, label: "Kelvin" }
  },
  data: {
    b: { symbol: "B", factor: 1, label: "Byte" },
    kb: { symbol: "KB", factor: 1000, label: "Kilobyte" },
    mb: { symbol: "MB", factor: 1_000_000, label: "Megabyte" },
    gb: { symbol: "GB", factor: 1_000_000_000, label: "Gigabyte" },
    tb: { symbol: "TB", factor: 1_000_000_000_000, label: "Terabyte" },
    kib: { symbol: "KiB", factor: 1024, label: "Kibibyte" },
    mib: { symbol: "MiB", factor: 1_048_576, label: "Mebibyte" },
    gib: { symbol: "GiB", factor: 1_073_741_824, label: "Gibibyte" },
    tib: { symbol: "TiB", factor: 1_099_511_627_776, label: "Tebibyte" }
  },
  volume: {
    ml: { symbol: "mL", factor: 0.001, label: "Millilitre" },
    l: { symbol: "L", factor: 1, label: "Litre" },
    tsp: { symbol: "tsp", factor: 0.00492892159375, label: "Teaspoon (US)" },
    tbsp: { symbol: "tbsp", factor: 0.01478676478125, label: "Tablespoon (US)" },
    "fl oz": { symbol: "fl oz", factor: 0.0295735295625, label: "Fluid ounce (US)" },
    cup: { symbol: "cup", factor: 0.2365882365, label: "Cup (US)" },
    pt: { symbol: "pt", factor: 0.473176473, label: "Pint (US)" },
    qt: { symbol: "qt", factor: 0.946352946, label: "Quart (US)" },
    gal: { symbol: "gal", factor: 3.785411784, label: "Gallon (US)" }
  },
  time: {
    ms: { symbol: "ms", factor: 0.001, label: "Millisecond" },
    s: { symbol: "s", factor: 1, label: "Second" },
    min: { symbol: "min", factor: 60, label: "Minute" },
    h: { symbol: "h", factor: 3600, label: "Hour" },
    day: { symbol: "day", factor: 86_400, label: "Day" },
    week: { symbol: "wk", factor: 604_800, label: "Week" }
  }
};

export function unitCategories(): UnitCategory[] {
  return Object.keys(UNITS) as UnitCategory[];
}

export function unitsFor(category: UnitCategory): UnitDef[] {
  return Object.values(UNITS[category]);
}

export function isKnownUnit(category: UnitCategory, symbol: string): boolean {
  return symbol in UNITS[category];
}

function toBase(category: UnitCategory, value: number, unit: string): number {
  if (category === "temperature") {
    switch (unit) {
      case "c":
        return value;
      case "f":
        return (value - 32) * (5 / 9);
      case "k":
        return value - 273.15;
    }
  }
  return value * UNITS[category][unit]!.factor;
}

function fromBase(category: UnitCategory, base: number, unit: string): number {
  if (category === "temperature") {
    switch (unit) {
      case "c":
        return base;
      case "f":
        return base * (9 / 5) + 32;
      case "k":
        return base + 273.15;
    }
  }
  return base / UNITS[category][unit]!.factor;
}

/** Converts a value between units of one category. Throws on unknown units. */
export function convertUnit(category: UnitCategory, value: number, from: string, to: string): number {
  if (!isKnownUnit(category, from)) throw new Error(`Unknown unit "${from}".`);
  if (!isKnownUnit(category, to)) throw new Error(`Unknown unit "${to}".`);
  if (!Number.isFinite(value)) throw new Error("Value must be a number.");
  return fromBase(category, toBase(category, value, from), to);
}

/** Rounds to a sane number of significant digits for display. */
export function formatConverted(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 1e9 || abs < 1e-6)) return value.toExponential(4);
  const decimals = abs >= 100 ? 2 : abs >= 1 ? 4 : 6;
  return value.toFixed(decimals).replace(/\.?0+$/, "");
}

/* Date & time --------------------------------------------------------------- */

/** Whole days between two ISO date strings (a − b). */
export function dateDiffDays(aIso: string, bIso: string): number {
  const a = new Date(aIso);
  const b = new Date(bIso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) {
    throw new Error("Enter valid dates (YYYY-MM-DD).");
  }
  const aDay = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const bDay = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((aDay - bDay) / 86_400_000);
}

/** Adds `days` to an ISO date string; returns YYYY-MM-DD (local). */
export function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error("Enter a valid date (YYYY-MM-DD).");
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Formats an ISO instant in a named IANA time zone (e.g. "America/New_York"). */
export function formatInTimeZone(iso: string, timeZone: string, locale = "en-GB"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error("Enter a valid date-time.");
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone,
      dateStyle: "medium",
      timeStyle: "short"
    }).format(d);
  } catch {
    throw new Error(`Unknown time zone "${timeZone}" — use an IANA name like Europe/London.`);
  }
}
