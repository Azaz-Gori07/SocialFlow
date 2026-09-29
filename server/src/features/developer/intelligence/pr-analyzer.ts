/**
 * Single-PR analysis: linked issues, category, merge potential. Pure.
 */

export interface PRIntelligence {
  title: string;
  body: string | null;
  number: number;
  state: string;
  linkedIssueNumbers: number[];
  category: string;
  summary: string;
  mergePotential: number;
}

const PR_CATEGORY_PATTERNS: Array<{ re: RegExp; category: string }> = [
  { re: /^fix|bug|hotfix/i, category: 'BUG_FIX' },
  { re: /^feat|feature|add|implement/i, category: 'FEATURE' },
  { re: /^refactor|clean|restructure/i, category: 'REFACTOR' },
  { re: /^perf|performance|optimize/i, category: 'PERFORMANCE' },
  { re: /^docs?|documentation/i, category: 'DOCUMENTATION' },
  { re: /^test|spec/i, category: 'TEST' },
  { re: /^chore|dep|bump/i, category: 'DEPENDENCY' },
  { re: /security|auth|vuln/i, category: 'SECURITY' },
  { re: /migrat|schema|database/i, category: 'DATABASE' }
];

/** Analyze a single PR: category, linked issues, summary. Deterministic. */
export function analyzePullRequest(pr: {
  title: string;
  body?: string | null;
  number: number;
  state: string;
}): PRIntelligence {
  const linkedIssueNumbers = new Set<number>();
  const text = `${pr.title} ${pr.body ?? ''}`;
  for (const m of text.matchAll(/(?:closes?|fixes?|resolves?)\s+#(\d+)/gi)) {
    linkedIssueNumbers.add(parseInt(m[1], 10));
  }
  for (const m of text.matchAll(/\b#(\d+)\b/g)) {
    // Only treat as issue ref if in closing/resolving context or body reference
    const num = parseInt(m[1], 10);
    if (/\b(issue|problem|bug|task)\b/i.test(text.slice(Math.max(0, (m.index ?? 0) - 20), m.index ?? 0))) {
      linkedIssueNumbers.add(num);
    }
  }
  const category =
    PR_CATEGORY_PATTERNS.find((p) => p.re.test(pr.title))?.category ?? 'OTHER';
  // Merge potential: closed + linked issues + not draft
  const mergePotential = pr.state === 'closed' ? 100 : pr.state === 'open' && linkedIssueNumbers.size > 0 ? 70 : 40;
  return {
    title: pr.title,
    body: pr.body ?? null,
    number: pr.number,
    state: pr.state,
    linkedIssueNumbers: [...linkedIssueNumbers],
    category,
    summary: pr.title.replace(/\s+/g, ' ').trim().slice(0, 120),
    mergePotential
  };
}
