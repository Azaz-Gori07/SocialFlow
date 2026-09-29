/**
 * F5 — Smart content memory: decide whether a new opportunity should be
 * skipped (repetitive/covered/too frequent) before generation.
 * Pure — no DB. The covered-topic list is fetched by the service.
 */

export interface SkipDecision {
  skip: boolean;
  reason: string;
}

export function shouldSkipOpportunity(opts: {
  title: string;
  coveredTopics: string[];
  postsThisWeek: number;
  maxPostsPerWeek: string | null;
  importance: string;
  hasEvidence: boolean;
}): SkipDecision {
  // 1. Already-covered topic (same story posted before)
  const low = opts.title.toLowerCase();
  for (const topic of opts.coveredTopics) {
    const t = topic.toLowerCase().trim();
    if (t && (low.includes(t) || (low.length >= 25 && t.length >= 25 && tokensOverlap(low, t) >= 2))) {
      return { skip: true, reason: `Topic already covered (${t.slice(0, 40)})` };
    }
  }
  // 2. Low importance / insufficient evidence
  if (opts.importance === 'TRIVIAL' || opts.importance === 'LOW') {
    return { skip: true, reason: `Too low importance (${opts.importance})` };
  }
  if (!opts.hasEvidence) {
    return { skip: true, reason: 'Insufficient evidence' };
  }
  // 3. Frequency cap
  if (opts.maxPostsPerWeek && opts.maxPostsPerWeek !== 'every') {
    const cap = parseInt(opts.maxPostsPerWeek, 10);
    if (!Number.isNaN(cap) && opts.postsThisWeek >= cap) {
      return { skip: true, reason: `Frequency cap reached (${cap}/week)` };
    }
  }
  return { skip: false, reason: '' };
}

function tokensOverlap(a: string, b: string): number {
  const ta = new Set(a.split(/\W+/).filter((w) => w.length > 3));
  const tb = new Set(b.split(/\W+/).filter((w) => w.length > 3));
  let hits = 0;
  for (const w of ta) if (tb.has(w)) hits++;
  return hits;
}
