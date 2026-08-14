// v1 spam heuristic for anonymous comments: a static keyword list plus a
// multi-link check. Deliberately simple (per the Module 7 brief) — a starting
// point tuned by hand, not a fixed rule. Expected to need real-world tuning
// once actual spam patterns show up in the moderation queue.
const SPAM_KEYWORDS = [
  "viagra",
  "cialis",
  "casino",
  "poker online",
  "forex signals",
  "crypto giveaway",
  "make money fast",
  "work from home",
  "weight loss pills",
  "click here",
  "buy followers",
  "seo services",
  "cheap backlinks",
  "loan approved",
  "free bitcoin",
  "onlyfans",
  "penis enlargement",
  "hot singles",
  "act now",
  "limited time offer",
];

const URL_PATTERN = /https?:\/\/\S+|\bwww\.\S+/gi;
const MAX_URLS_ALLOWED = 1;

export interface SpamCheckResult {
  flagged: boolean;
  reason?: string;
}

export function checkForSpam(text: string): SpamCheckResult {
  const urlMatches = text.match(URL_PATTERN) ?? [];
  if (urlMatches.length > MAX_URLS_ALLOWED) {
    return { flagged: true, reason: `Contains ${urlMatches.length} links` };
  }

  const lower = text.toLowerCase();
  const matchedKeyword = SPAM_KEYWORDS.find((keyword) => lower.includes(keyword));
  if (matchedKeyword) {
    return { flagged: true, reason: `Matched spam keyword: "${matchedKeyword}"` };
  }

  return { flagged: false };
}
