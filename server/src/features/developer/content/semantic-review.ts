/**
 * Semantic review — deterministic AI-slop detector. Scores how human a post
 * reads (0-100) from high-precision marketing-slop patterns. Generation
 * rejects variants scoring below the HUMANLIKE_FLOOR. Pure — no AI in the
 * final gate, matching the fact-checker's philosophy.
 */

export interface SemanticIssue {
  message: string;
  matchedPhrase?: string;
}

export interface SemanticReviewResult {
  humanLike: number;
  issues: SemanticIssue[];
}

/** Weighted slop patterns: [regex, penalty, label]. High precision over recall. */
const SLOP_PATTERNS: Array<[RegExp, number, string]> = [
  [/in today'?s fast[- ]paced (digital )?(world|landscape)/i, 30, 'cliché opener'],
  [/leverag(e|es|ing) (cutting[- ]edge|state[- ]of[- ]the[- ]art|industry[- ]leading|best[- ]in[- ]class)/i, 20, 'marketing leverage'],
  [/\bsynerg(y|ize|izes|istic)\b/i, 15, 'synergy'],
  [/\bgame[- ]?changer\b|\bparadigm shift\b|\brevolutioniz(e|es|ing)\b/i, 15, 'hype noun'],
  [/\bdelve(s)? (into|deeper)\b/i, 15, 'delve'],
  [/it'?s not just about\b|\bmore than just a\b/i, 15, 'filler contrast'],
  [/unlock (the )?(true )?(power|potential) of\b/i, 15, 'unlock potential'],
  [/\bseamless(ly)?\b|\beffortless(ly)?\b/i, 10, 'seamless/effortless'],
  [/\bnavigate the (complexities|landscape|ever[- ]changing)\b/i, 10, 'navigate complexities'],
  [/\brobust\b.{0,30}\bscalable\b.{0,30}\bsecure\b/i, 10, 'buzzword triple'],
  [/!{2,}/, 5, 'multiple exclamation marks']
];

export const HUMANLIKE_FLOOR = 60;

export function semanticReview(post: string): SemanticReviewResult {
  let score = 100;
  const issues: SemanticIssue[] = [];
  for (const [re, penalty, label] of SLOP_PATTERNS) {
    const m = post.match(re);
    if (m) {
      score -= penalty;
      issues.push({ message: `AI-slop pattern: ${label}`, matchedPhrase: m[0].slice(0, 60) });
    }
  }
  return { humanLike: Math.max(0, score), issues };
}
