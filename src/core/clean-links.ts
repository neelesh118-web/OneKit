/**
 * Clean Link — strips tracking/analytics query parameters from URLs.
 * Pure function module: parse, drop junk params, reassemble. If the URL
 * cannot be parsed, the input is returned unchanged (never a fake "cleaned"
 * result).
 */

/** Well-known tracking / campaign / click-id parameters. */
const TRACKING_PARAMS = new Set([
  // UTM family
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "utm_campaignid",
  "utm_adgroup",
  "utm_adid",
  "utm_affiliate",
  "utm_brand",
  "utm_channel",
  "utm_click_id",
  "utm_customer",
  "utm_creative",
  "utm_device",
  "utm_geo",
  "utm_keyword",
  "utm_network",
  "utm_partner",
  "utm_placement",
  "utm_pubreferrer",
  "utm_referrer",
  "utm_region",
  "utm_share",
  "utm_social",
  "utm_social-type",
  "utm_user",
  "utm_viz_id",
  // Click/attribution IDs
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "msclkid",
  "twclid",
  "li_fat_id",
  "igshid",
  "yclid",
  "gbraid",
  "wbraid",
  "rb_clickid",
  "s_cid",
  "irclickid",
  "aff_id",
  "cjevent",
  "vero_id",
  "vero_conv",
  "oly_anon_id",
  "oly_enc_id",
  "wickedid",
  "s_kwcid",
  "epik",
  // Email marketing
  "mc_cid",
  "mc_eid",
  "mkt_tok",
  "cmpid",
  "emc",
  "spm",
  "scm",
  // Generic referrer-ish junk
  "ref",
  "ref_src",
  "ref_url",
  "source",
  "si",
  "from",
  "campaign",
  "campaignid",
  "adgroupid",
  "adid",
  "keywordid",
  "matchtype",
  "network",
  "device",
  "placement",
  "targetid",
  "feeditemid",
  "loc_interest_ms",
  "loc_physical_ms",
  // HubSpot / ad-platform params
  "hsa_acc",
  "hsa_ad",
  "hsa_cam",
  "hsa_grp",
  "hsa_kw",
  "hsa_mt",
  "hsa_net",
  "hsa_src",
  "hsa_tgt",
  "hsa_ver"
]);

export interface CleanResult {
  url: string;
  removed: string[];
  changed: boolean;
}

export function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  // Some providers append a hash to the param name (e.g. fbclid=…#x) — exact
  // match plus a "starts with" check for known prefixes keeps those caught.
  return TRACKING_PARAMS.has(lower) || lower.startsWith("utm_");
}

/** Cleans a single URL string. Returns the input unchanged if unparseable. */
export function cleanLink(raw: string): string {
  return cleanUrl(raw).url;
}

export function cleanUrl(raw: string): CleanResult {
  const trimmed = raw.trim();
  if (!trimmed) return { url: trimmed, removed: [], changed: false };
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    // Not a valid absolute URL (e.g. a bare path or a typo) — do not guess.
    return { url: trimmed, removed: [], changed: false };
  }
  // Only http(s) links can carry these web-tracking params; leave other
  // schemes alone (mailto:, tel:, chrome://, about:…).
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { url: trimmed, removed: [], changed: false };
  }
  const removed: string[] = [];
  const keep: string[] = [];
  for (const [key, value] of parsed.searchParams.entries()) {
    if (isTrackingParam(key)) {
      removed.push(key);
    } else {
      keep.push(`${key}=${value}`);
    }
  }
  if (removed.length === 0) {
    return { url: trimmed, removed: [], changed: false };
  }
  // Rebuild with the remaining params, preserving original hash.
  const hash = parsed.hash;
  let out = `${parsed.origin}${parsed.pathname}`;
  if (keep.length > 0) out += `?${keep.join("&")}`;
  out += hash;
  return { url: out, removed, changed: true };
}

/** Cleans a list of URLs in one pass (used by tests and bulk contexts). */
export function cleanLinks(urls: string[]): CleanResult[] {
  return urls.map(cleanUrl);
}
