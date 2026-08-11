/**
 * Affiliate & tracking-link inspector — flags links that will hurt you
 * when shared or monetized: missing rel on affiliate domains, missing UTM
 * campaign params, bloated tracking params, redirect wrappers. Pure local
 * heuristics — honest about what it can and cannot know.
 */

export interface LinkToCheck {
  url: string;
  /** Raw rel attribute of the anchor ("" when absent). */
  rel?: string;
}

export interface LinkIssue {
  code: string;
  message: string;
  severity: "warn" | "error";
}

export interface LinkCheckResult {
  url: string;
  issues: LinkIssue[];
}

const AFFILIATE_HOSTS = [
  "amazon",
  "ebay",
  "aliexpress",
  "temu",
  "shein",
  "walmart",
  "bestbuy",
  "etsy",
  "awin",
  "shareasale",
  "impactradius",
  "cj.com",
  "rakuten",
  "skimlinks",
  "viglink",
  "flexoffers",
  "partnerize",
  "webgains",
  "booking.com",
  "agoda",
  "expedia",
  "hotels.com",
  "vrbo",
  "airbnb"
];

const TRACKING_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid", "mc_cid", "mc_eid", "igshid", "ref", "ref_", "spm", "scm", "irclickid", "s_kwcid"];

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** Is this host an affiliate network / storefront that usually requires rel? */
function isAffiliateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return AFFILIATE_HOSTS.some((needle) => h.includes(needle));
}

/** Strip trailing punctuation a copy-paste can add. */
export function tidyUrl(raw: string): string {
  return raw.trim().replace(/[.,;:!?)\]]+$/, "");
}

export function checkLink(link: LinkToCheck): LinkCheckResult {
  const url = tidyUrl(link.url);
  const issues: LinkIssue[] = [];
  const parsed = parse(url);
  if (!parsed) {
    return { url, issues: [{ code: "invalid", message: "Not a valid URL.", severity: "error" }] };
  }
  const hostname = parsed.hostname;
  const rel = (link.rel ?? "").toLowerCase();

  if (isAffiliateHost(hostname) && !rel.includes("nofollow")) {
    issues.push({
      code: "rel-nofollow",
      message: `${hostname} looks like an affiliate/storefront link — add rel="nofollow sponsored" or Google may not count it.`,
      severity: "warn"
    });
  }

  const hasUtm = TRACKING_PARAMS.some((p) => parsed.searchParams.has(p));
  if (!hasUtm && /(affiliate|ref|referral|partner|tag|click)/i.test(url)) {
    issues.push({
      code: "missing-utm",
      message: "This link mentions affiliate/ref/partner but has no UTM params — your analytics can't attribute it.",
      severity: "warn"
    });
  }

  const tracking = TRACKING_PARAMS.filter((p) => parsed.searchParams.has(p));
  if (tracking.length > 2) {
    issues.push({
      code: "tracking-bloat",
      message: `${tracking.length} tracking params (${tracking.slice(0, 4).join(", ")}) — clean it before sharing.`,
      severity: "warn"
    });
  }

  if (hostname.includes("l.facebook.com") || hostname.includes("lm.facebook.com") || hostname.includes("google.com/url") || hostname.includes("l.instagram.com")) {
    issues.push({
      code: "redirect-wrapper",
      message: `${hostname} is a redirect wrapper — copy the destination URL instead.`,
      severity: "error"
    });
  }

  if (parsed.protocol !== "https:") {
    issues.push({
      code: "not-https",
      message: "Not HTTPS — visitors and SEO will be penalized.",
      severity: "warn"
    });
  }

  return { url, issues };
}

export function checkLinks(list: LinkToCheck[]): LinkCheckResult[] {
  return list.map(checkLink);
}

/** Counts how many of the checked links have at least one issue. */
export function summaryOf(results: LinkCheckResult[]): { checked: number; flagged: number } {
  return { checked: results.length, flagged: results.filter((r) => r.issues.length > 0).length };
}
