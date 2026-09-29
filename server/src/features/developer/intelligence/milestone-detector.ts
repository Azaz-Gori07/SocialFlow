/**
 * Milestone detection over an already-scored activity. Pure.
 */

export interface MilestoneCandidate {
  detected: boolean;
  title?: string;
  reason?: string;
  score: number;
}

const MILESTONE_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /v?\d+\.\d+(\.\d+)?/i, label: 'Version release' },
  { re: /release/i, label: 'Release' },
  { re: /(launch|ship|go live)/i, label: 'Launch' },
  { re: /migrat/i, label: 'Migration completed' },
  { re: /redesign|re-architect|architecture/i, label: 'Architecture redesign' },
  { re: /integrat/i, label: 'Integration completed' },
  { re: /(implemented|completed|finished) (real[- ]time|payment|auth|sync)/i, label: 'Major feature implementation' },
  { re: /first (release|version|commit)/i, label: 'First release' },
  { re: /breaking/i, label: 'Breaking change' },
  { re: /performance (improvement|optimization|boost)/i, label: 'Performance milestone' }
];

/**
 * Detect whether a set of work represents a project milestone.
 * Deterministic: matches against commit/PR titles + importance signals.
 */
export function detectMilestone(opts: {
  title: string;
  importanceLevel: string;
  importanceScore: number;
  commitCount: number;
  filesChanged: number;
  otherTitles?: string[];
}): MilestoneCandidate {
  const match = MILESTONE_PATTERNS.find((p) => p.re.test(opts.title));
  if (match) {
    return {
      detected: true,
      title: match.label,
      reason: `Matched "${match.label}" pattern in "${opts.title.slice(0, 60)}"`,
      score: 90
    };
  }
  // High-importance + multi-file + multi-commit heuristic
  if (
    opts.importanceLevel === 'MILESTONE' &&
    opts.importanceScore >= 80 &&
    opts.commitCount >= 3 &&
    opts.filesChanged >= 10
  ) {
    return {
      detected: true,
      title: opts.title.slice(0, 120),
      reason: `Major work: ${opts.commitCount} commits, ${opts.filesChanged} files, importance ${opts.importanceScore}/100`,
      score: 80
    };
  }
  return { detected: false, title: undefined, reason: undefined, score: 0 };
}
