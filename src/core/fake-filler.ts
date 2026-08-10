/**
 * Fake form filler — random-but-plausible test data for form fields.
 *
 * Devs and testers fill dozens of forms with junk while testing. This
 * generates believable random values per field type (name, email, phone,
 * address, credit card…), matching the field's own semantics so the data
 * passes client-side validation. Everything is generated locally from a
 * seedable RNG — no network, no real data.
 */

export interface FillerOptions {
  /** When set, the same seed produces the same data (deterministic tests). */
  seed?: number;
  locale?: "us";
}

/** Mulberry32 — tiny deterministic PRNG so tests can pin exact output. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = ["Ava", "Liam", "Mia", "Noah", "Zoe", "Ethan", "Lily", "Mason", "Ruby", "Caleb", "Ivy", "Owen", "Nora", "Felix", "Ella", "Jonah", "Alice", "Theo", "Hazel", "Silas"];
const LAST_NAMES = ["Smith", "Johnson", "Brown", "Garcia", "Miller", "Davis", "Wilson", "Moore", "Taylor", "Anderson", "Thomas", "Jackson", "White", "Harris", "Martin", "Thompson", "Walker", "Hall", "Allen", "Young"];
const STREETS = ["Maple St", "Oak Ave", "Pine Rd", "Cedar Ln", "Birch Dr", "Elm Ct", "River Way", "Hill St", "Lake Ave", "Park Blvd"];
const CITIES = ["Austin", "Denver", "Portland", "Raleigh", "Madison", "Boise", "Tucson", "Nashville", "Spokane", "Savannah"];
const STATES = ["TX", "CO", "OR", "NC", "WI", "ID", "AZ", "TN", "WA", "GA"];
const EMAIL_DOMAINS = ["example.com", "test.dev", "mailinator.net", "example.org", "sample.io"];
const COMPANY_SUFFIXES = ["Inc", "LLC", "Ltd", "Co", "Group"];

function pick<T>(rng: () => number, list: T[]): T {
  return list[Math.floor(rng() * list.length)] ?? list[0]!;
}

function rngFor(options: FillerOptions): () => number {
  return mulberry32(options.seed ?? Math.floor(Math.random() * 2 ** 31));
}

export interface FakePerson {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  company: string;
  username: string;
  password: string;
  creditCard: string;
  ssn: string;
}

/** One coherent fake person — all values pair consistently (name matches email, etc.). */
export function fakePerson(options: FillerOptions = {}): FakePerson {
  const rng = rngFor(options);
  const firstName = pick(rng, FIRST_NAMES);
  const lastName = pick(rng, LAST_NAMES);
  const zip = String(10000 + Math.floor(rng() * 89999));
  const digits = (n: number): string =>
    Array.from({ length: n }, () => Math.floor(rng() * 10)).join("");
  const phone = `(${digits(3)}) ${digits(3)}-${digits(4)}`;
  const username = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${Math.floor(rng() * 99) + 1}`;
  const zipNum = Number(zip) || 0;
  const password = `Test-${firstName}${digits(4)}!`;
  const cc = `${digits(4)}-${digits(4)}-${digits(4)}-${digits(4)}`;
  const ssn = `${digits(3)}-${digits(2)}-${digits(4)}`;
  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${pick(rng, EMAIL_DOMAINS)}`,
    phone,
    street: `${100 + Math.floor(rng() * 8999)} ${pick(rng, STREETS)}`,
    city: pick(rng, CITIES),
    state: pick(rng, STATES),
    zip,
    company: `${pick(rng, FIRST_NAMES)} ${pick(rng, COMPANY_SUFFIXES)}`,
    username,
    password,
    creditCard: cc,
    ssn
  };
}

/** Field-type classification by name, id, placeholder, autocomplete, type. */
export type FieldKind =
  | "name"
  | "email"
  | "phone"
  | "street"
  | "city"
  | "state"
  | "zip"
  | "company"
  | "username"
  | "password"
  | "cc"
  | "ssn"
  | "generic";

const KIND_PATTERNS: Array<[FieldKind, RegExp]> = [
  ["email", /email|mail/i],
  ["phone", /phone|tel|mobile|cell/i],
  ["cc", /card|ccnum|credit/i],
  ["ssn", /ssn|social.*sec|national.?id/i],
  ["zip", /zip|postal|postcode/i],
  ["state", /state|province|region/i],
  ["city", /city|town/i],
  ["street", /street|address|addr|line1|line-?1/i],
  ["company", /company|organization|org|employer/i],
  ["username", /user(name|id)?|login|handle/i],
  ["password", /pass(word|wd)?/i],
  ["name", /name|first|last|full/i]
];

/** Classifies a form field so the filler picks the right kind of value. */
export function classifyField(meta: {
  name?: string;
  id?: string;
  placeholder?: string;
  autocomplete?: string;
  type?: string;
}): FieldKind {
  if (meta.type === "password") return "password";
  const haystack = [meta.name, meta.id, meta.placeholder, meta.autocomplete].filter(Boolean).join(" ");
  if (!haystack.trim()) return "generic";
  for (const [kind, pattern] of KIND_PATTERNS) {
    if (pattern.test(haystack)) return kind;
  }
  return "generic";
}

/** The value to fill for a field kind, consistent with one person. */
export function valueForKind(kind: FieldKind, person: FakePerson): string {
  switch (kind) {
    case "name":
      return person.fullName;
    case "email":
      return person.email;
    case "phone":
      return person.phone;
    case "street":
      return person.street;
    case "city":
      return person.city;
    case "state":
      return person.state;
    case "zip":
      return person.zip;
    case "company":
      return person.company;
    case "username":
      return person.username;
    case "password":
      return person.password;
    case "cc":
      return person.creditCard;
    case "ssn":
      return person.ssn;
    default:
      return `${person.firstName.toLowerCase()}${Math.floor(Number(person.zip) || 0) % 100}`;
  }
}
