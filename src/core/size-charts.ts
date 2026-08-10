/**
 * Size chart switcher — US / UK / EU / international clothing and shoe
 * sizes in one click. Static conversion tables (clothing S–XXL, numeric
 * men's/women's, shoes) bundled locally; nothing leaves the device.
 * Shopper pain: "what size am I in this country's store?" answered
 * instantly without the table-hunt.
 */

export type SizeCategory = "clothing" | "men-shoes" | "women-shoes" | "kids";

export interface SizeChartRow {
  label: string;
  us?: string;
  uk?: string;
  eu?: string;
  intl?: string;
}

export const SIZE_CHARTS: Record<SizeCategory, { title: string; rows: SizeChartRow[] }> = {
  clothing: {
    title: "Clothing (S–XXL)",
    rows: [
      { label: "XXS", us: "00", uk: "4", eu: "32", intl: "XS" },
      { label: "XS", us: "0–2", uk: "6–8", eu: "34–36", intl: "XS" },
      { label: "S", us: "4–6", uk: "10–12", eu: "38–40", intl: "S" },
      { label: "M", us: "8–10", uk: "12–14", eu: "40–42", intl: "M" },
      { label: "L", us: "12–14", uk: "16–18", eu: "44–46", intl: "L" },
      { label: "XL", us: "16–18", uk: "18–20", eu: "48–50", intl: "XL" },
      { label: "XXL", us: "20–22", uk: "22–24", eu: "52–54", intl: "XXL" }
    ]
  },
  "men-shoes": {
    title: "Men's shoes",
    rows: [
      { label: "6", us: "6", uk: "5.5", eu: "39" },
      { label: "7", us: "7", uk: "6.5", eu: "40" },
      { label: "8", us: "8", uk: "7.5", eu: "41–42" },
      { label: "9", us: "9", uk: "8.5", eu: "42–43" },
      { label: "10", us: "10", uk: "9.5", eu: "43–44" },
      { label: "11", us: "11", uk: "10.5", eu: "45" },
      { label: "12", us: "12", uk: "11.5", eu: "46" }
    ]
  },
  "women-shoes": {
    title: "Women's shoes",
    rows: [
      { label: "5", us: "5", uk: "3", eu: "35–36" },
      { label: "6", us: "6", uk: "4", eu: "36–37" },
      { label: "7", us: "7", uk: "5", eu: "38" },
      { label: "8", us: "8", uk: "6", eu: "39" },
      { label: "9", us: "9", uk: "7", eu: "40–41" },
      { label: "10", us: "10", uk: "8", eu: "42" },
      { label: "11", us: "11", uk: "9", eu: "43" }
    ]
  },
  kids: {
    title: "Kids' clothing (age → EU height)",
    rows: [
      { label: "0–3m", us: "0–3m", uk: "0–3m", eu: "56–62", intl: "Newborn" },
      { label: "3–6m", us: "3–6m", uk: "3–6m", eu: "62–68", intl: "Newborn" },
      { label: "6–12m", us: "6–12m", uk: "6–12m", eu: "68–74", intl: "Infant" },
      { label: "1y", us: "12–18m", uk: "12–18m", eu: "74–80", intl: "Toddler" },
      { label: "2y", us: "2T", uk: "2", eu: "86–92", intl: "Toddler" },
      { label: "4y", us: "4T", uk: "4", eu: "98–104", intl: "Kid" },
      { label: "6y", us: "6", uk: "6", eu: "110–116", intl: "Kid" },
      { label: "8y", us: "8", uk: "8", eu: "122–128", intl: "Kid" },
      { label: "10y", us: "10", uk: "10", eu: "134–140", intl: "Kid" }
    ]
  }
};

export const SIZE_CATEGORIES = Object.keys(SIZE_CHARTS) as SizeCategory[];

/** Looks up the US/UK/EU row for a label within a category. */
export function lookupSize(category: SizeCategory, label: string): SizeChartRow | undefined {
  const chart = SIZE_CHARTS[category];
  return chart.rows.find((r) => r.label.toLowerCase() === label.toLowerCase());
}

/** Converts a row's value from one system to another (us/uk/eu/intl). */
export function convertSize(
  category: SizeCategory,
  from: "us" | "uk" | "eu" | "intl",
  value: string
): SizeChartRow | null {
  const chart = SIZE_CHARTS[category];
  const row = chart.rows.find((r) => (r[from] ?? "").toLowerCase() === value.toLowerCase());
  return row ?? null;
}

/** Searchable list of every category + row, for a quick "what's my EU size?" picker. */
export function allSizeRows(): Array<{ category: SizeCategory; title: string; rows: SizeChartRow[] }> {
  return SIZE_CATEGORIES.map((category) => ({
    category,
    title: SIZE_CHARTS[category].title,
    rows: SIZE_CHARTS[category].rows
  }));
}
