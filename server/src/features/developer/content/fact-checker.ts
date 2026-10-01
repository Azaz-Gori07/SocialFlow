/**
 * F5 — Fact checker. Compares a generated post against the verified evidence.
 * Blocks hallucinated claims: invented metrics, unproven performance numbers,
 * fake achievements, and claims of completion unsupported by evidence.
 * Deterministic — no AI involved in the final gate. Pure.
 */

export interface FactCheckEvidence {
  prNumbers: number[];
  issueNumbers: number[];
  commitShas?: string[];
  commitCount: number;
  fileCount: number;
  totalAdditions: number;
  totalDeletions: number;
}

export interface FactCheckIssue {
  severity: 'error' | 'warning';
  message: string;
  matchedPhrase?: string;
}

export interface FactCheckResult {
  passed: boolean;
  issues: FactCheckIssue[];
}

export function factCheckPost(
  post: string,
  evidence: FactCheckEvidence,
  opts?: { activityTitle?: string }
): FactCheckResult {
  const issues: FactCheckIssue[] = [];
  const lower = post.toLowerCase();

  // 1. Invented numeric metrics (percentages / units not in evidence)
  const percentClaims = lower.match(/(\d+)\s*%/g) ?? [];
  for (const claim of percentClaims) {
    // No percentage exists in evidence (we never store percentages)
    issues.push({
      severity: 'error',
      message: `Percentage claim not supported by evidence: "${claim}". Remove or replace with evidence-backed detail.`,
      matchedPhrase: claim
    });
  }

  // 2. Performance/vibe claims without evidence backing
  const forbiddenPhrases = [
    /performance (improved|increased|boosted|optimized) by/i,
    /(\d+)x (faster|performance)/i,
    /reduced (latency|response time|load time) by/i,
    /increased (engagement|conversion|users?) by/i,
    /grew (users|revenue|downloads?) (to|by)/i
  ];
  for (const re of forbiddenPhrases) {
    const m = lower.match(re);
    if (m) {
      issues.push({
        severity: 'error',
        message: `Unsupported performance/impact claim: "${m[0]}". No measurement exists in the evidence.`,
        matchedPhrase: m[0]
      });
    }
  }

  // 3. Completion claims that evidence can't support
  //    Only allow "completed"/"shipped"/"released" when there's a PR (merged) or high commit count + files
  const completionPhrases = /(it's|is|was)?\s*(completed|fully shipped|released to production|production ready)/i;
  const hasStrongEvidence =
    evidence.commitCount >= 3 || evidence.prNumbers.length > 0 || evidence.totalAdditions >= 200;
  const m3 = lower.match(completionPhrases);
  if (m3 && !hasStrongEvidence) {
    issues.push({
      severity: 'warning',
      message: `Completion claim "${m3[0]}" may exceed evidence. If work is ongoing, use "working on" / "implementing".`,
      matchedPhrase: m3[0]
    });
  }

  // 4. Feature claims not in activity/memory context
  //    (e.g. mentions features not part of this work) — soft heuristics
  const numberChecks = lower.match(/(\d+)\s*(users?|customers?|downloads?|installations?)/g) ?? [];
  for (const claim of numberChecks) {
    issues.push({
      severity: 'error',
      message: `Unverified user/scale claim: "${claim}". Not present in evidence.`,
      matchedPhrase: claim
    });
  }

  // 5. Inflated diff-scale numbers (lines/files/commits beyond evidence totals).
  //    Under-claims ("3 files" of 10) are harmless; over-claims ("686 files"
  //    of 2) are hallucinated — flag only values exceeding the evidence.
  const scaleClaims =
    lower.match(/(\d[\d,]*(?:\.\d+)?)\s*([km])?\s*(lines?(?: of code)?|files?|commits?)\b/g) ?? [];
  for (const claim of scaleClaims) {
    const m = claim.match(/(\d[\d,]*(?:\.\d+)?)\s*([km])?\s*(lines?(?: of code)?|files?|commits?)\b/);
    if (!m) continue;
    let value = parseFloat(m[1].replace(/,/g, ''));
    const suffix = (m[2] ?? '').toLowerCase();
    if (suffix === 'k') value *= 1000;
    if (suffix === 'm') value *= 1000000;
    const unit = m[3].startsWith('line')
      ? [evidence.totalAdditions, evidence.totalDeletions, evidence.totalAdditions + evidence.totalDeletions]
      : m[3].startsWith('file')
        ? [evidence.fileCount]
        : [evidence.commitCount];
    const ceiling = Math.max(0, ...unit);
    if (ceiling > 0 && value > ceiling * 1.02) {
      issues.push({
        severity: 'error',
        message: `Inflated scale claim: "${claim.trim()}" exceeds evidence total (${ceiling}).`,
        matchedPhrase: claim.trim()
      });
    }
  }

  return { passed: issues.every((i) => i.severity !== 'error'), issues };
}

/**
 * Post validator: structural checks (length, hooks, hashtags, generic-tag ban).
 * Generic hashtag list from the brief: #coding #developer #ai #tech #programming #buildinpublic
 */
const GENERIC_HASHTAGS = ['coding', 'developer', 'ai', 'tech', 'programming', 'buildinpublic'];

export interface ValidationIssue {
  severity: 'error' | 'warning';
  message: string;
}

export interface PostValidation {
  valid: boolean;
  issues: ValidationIssue[];
}

export function validatePost(post: string): PostValidation {
  const issues: ValidationIssue[] = [];
  const words = post.trim().split(/\s+/).filter(Boolean).length;

  if (words < 30) issues.push({ severity: 'error', message: 'Post too short (<30 words).' });
  if (words > 1300) issues.push({ severity: 'warning', message: 'Post very long (>1300 words) — LinkedIn truncates at ~1300.' });

  const hashtags = post.match(/#\w+/g) ?? [];
  const genericUsed = hashtags.filter((h) => GENERIC_HASHTAGS.includes(h.slice(1).toLowerCase()));
  if (genericUsed.length > 0) {
    issues.push({
      severity: 'warning',
      message: `Generic hashtag(s) found: ${genericUsed.join(', ')}. Use only project/tech-relevant tags.`
    });
  }

  // Must reference the actual work subject minimally (have a hook / context)
  if (!post.includes('.') && !post.includes('\n')) {
    issues.push({ severity: 'warning', message: 'No sentence break detected — may be a single run-on block.' });
  }

  // Reasoning-leak: the model echoed its chain-of-thought instead of the post.
  // Such output must never reach review, let alone LinkedIn.
  const leakMarkers = [
    /here'?s my thinking/i,
    /here is my thinking/i,
    /thinking process/i,
    /analy[sz]e the request/i,
    /deconstruct the evidence/i,
    /<think[\s>]/i,
    /<\|tool_call_(start|end)\|>/i,
    /\[write_post\(/i,
    /\bwrite_post\s*\(/i
  ];
  for (const re of leakMarkers) {
    const m = post.match(re);
    if (m) {
      issues.push({
        severity: 'error',
        message: `Reasoning leak detected ("${m[0]}") — model emitted its thinking instead of the post.`
      });
      break;
    }
  }

  return { valid: issues.every((i) => i.severity !== 'error'), issues };
}
