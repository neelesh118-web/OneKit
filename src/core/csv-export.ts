/**
 * CSV export — the standard interchange format. Password managers, 2FA
 * apps, and spreadsheet tools all accept these exact columns, so this is
 * how OneKit data travels to other apps. 100% local.
 */

export function toCsv(rows: string[][]): string {
  const esc = (v: string): string => `"${(v ?? "").replace(/"/g, '""')}"`;
  return rows.map((row) => row.map(esc).join(",")).join("\n");
}

export interface PasswordRow {
  name: string;
  url: string;
  username: string;
  password: string;
  notes: string;
}

/** The columns Bitwarden / KeePassXC / Dashlane imports accept. */
export function passwordsCsv(rows: PasswordRow[]): string {
  return toCsv([
    ["name", "url", "username", "password", "notes"],
    ...rows.map((r) => [r.name, r.url, r.username, r.password, r.notes])
  ]);
}

export interface TotpRow {
  label: string;
  secret: string;
  issuer?: string;
  algorithm?: string;
  digits?: number;
  period?: number;
}

/** The columns common 2FA importers (otpauth-style) expect. */
export function totpCsv(rows: TotpRow[]): string {
  return toCsv([
    ["label", "secret", "issuer", "algorithm", "digits", "period"],
    ...rows.map((r) => [r.label, r.secret, r.issuer ?? "", r.algorithm ?? "SHA1", String(r.digits ?? 6), String(r.period ?? 30)])
  ]);
}
