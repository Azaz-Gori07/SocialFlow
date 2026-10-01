/**
 * Deterministic importance scoring. Pure: no DB, no clock, no IO.
 * Thresholds are load-bearing — changing one changes which activities reach
 * memory, opportunities, and generated content.
 */

export type ImportanceLevel = 'TRIVIAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'MILESTONE';

export interface ImportanceScore {
  level: ImportanceLevel;
  score: number; // 0-100
  reasons: string[];
  linkedInWorthy: boolean;
}

export interface ScoredActivity {
  totalFilesChanged: number;
  totalAdditions: number;
  totalDeletions: number;
  commitCount: number;
  hasPR: boolean;
  prNumber?: number;
  issueCount: number;
  hasNewAPICalls: boolean;
  hasNewFiles: boolean;
  hasMergedPR: boolean;
  hasRelease: boolean;
  affectedModules: number;
  touchesAuth: boolean;
  touchesDatabase: boolean;
  touchesUI: boolean;
  touchesTests: boolean;
  categories: string[];
  message?: string;
}

/** Score a development activity (commit group or PR) 0-100, deterministic. */
export function scoreImportance(activity: ScoredActivity): ImportanceScore {
  let score = 0;
  const reasons: string[] = [];

  // File count impact
  if (activity.totalFilesChanged >= 20) { score += 15; reasons.push(`Significant scope: ${activity.totalFilesChanged} files changed`); }
  else if (activity.totalFilesChanged >= 10) { score += 10; reasons.push(`Moderate scope: ${activity.totalFilesChanged} files changed`); }
  else if (activity.totalFilesChanged >= 5) { score += 5; }

  // Line changes
  const totalChanges = activity.totalAdditions + activity.totalDeletions;
  if (totalChanges >= 500) { score += 12; reasons.push(`Large diff: ${totalChanges} lines`); }
  else if (totalChanges >= 100) { score += 6; }

  // Commit count (multi-commit = intentional work)
  if (activity.commitCount >= 5) { score += 8; reasons.push(`Multi-commit effort: ${activity.commitCount} commits`); }
  else if (activity.commitCount >= 3) { score += 4; }

  // PR relationship
  if (activity.hasPR) { score += 5; reasons.push('PR reviewed'); }
  if (activity.hasMergedPR) { score += 3; }

  // Issue relationship (linked work)
  if (activity.issueCount >= 1) { score += 4; reasons.push(`Linked to ${activity.issueCount} issue(s)`); }

  // Architecture impact
  if (activity.hasNewAPICalls) { score += 8; reasons.push('New API surface introduced'); }
  if (activity.hasNewFiles) { score += 5; reasons.push('New files added'); }
  if (activity.hasRelease) { score += 10; reasons.push('Part of a release'); }

  // Module breadth
  if (activity.affectedModules >= 4) { score += 10; reasons.push(`Cross-cutting change: ${activity.affectedModules} modules`); }
  else if (activity.affectedModules >= 2) { score += 5; reasons.push(`Changes span ${activity.affectedModules} modules`); }

  // High-impact areas
  if (activity.touchesAuth) { score += 6; reasons.push('Touches authentication/security'); }
  if (activity.touchesDatabase) { score += 5; reasons.push('Database changes'); }
  if (activity.touchesUI) { score += 3; reasons.push('UI changes'); }
  if (activity.touchesTests) { score += 2; reasons.push('Includes tests'); }

  // Message content heuristics
  const msg = (activity.message ?? '').toLowerCase();
  if (/breaking|BREAKING/i.test(msg)) { score += 15; reasons.push('Breaking change detected'); }
  if (/major|redesign|rewrite|architecture/i.test(msg)) { score += 10; reasons.push('Significant refactoring indicated'); }
  if (/v\d+\.\d+|release|version/i.test(msg)) { score += 8; reasons.push('Version/release related'); }

  // Cap score
  score = Math.min(100, score);

  // Determine level
  let level: ImportanceLevel;
  if (score >= 70) level = 'MILESTONE';
  else if (score >= 45) level = 'HIGH';
  else if (score >= 25) level = 'MEDIUM';
  else if (score >= 10) level = 'LOW';
  else level = 'TRIVIAL';

  // LinkedIn-worthy: MILESTONE or HIGH with reasons
  const linkedInWorthy = (level === 'MILESTONE' || (level === 'HIGH' && reasons.length >= 3));

  return { level, score, reasons, linkedInWorthy };
}

/**
 * Build the scored-activity input from raw records.
 * Pure function — no DB calls, no AI, no side effects.
 */
export function buildScoredActivityInput(opts: {
  files: Array<{ filename: string; status: string; additions: number; deletions: number }>;
  categories: string[];
  commitCount: number;
  hasPR: boolean;
  prNumber?: number;
  issueCount: number;
  hasNewFiles: boolean;
  hasMergedPR: boolean;
  hasRelease: boolean;
  affectedModules: string[];
  message?: string;
}): ScoredActivity {
  return {
    totalFilesChanged: opts.files.length,
    totalAdditions: opts.files.reduce((s, f) => s + f.additions, 0),
    totalDeletions: opts.files.reduce((s, f) => s + f.deletions, 0),
    commitCount: opts.commitCount,
    hasPR: opts.hasPR,
    prNumber: opts.prNumber,
    issueCount: opts.issueCount,
    hasNewAPICalls: opts.categories.includes('API'),
    hasNewFiles: opts.hasNewFiles,
    hasMergedPR: opts.hasMergedPR,
    hasRelease: opts.hasRelease,
    affectedModules: opts.affectedModules.length,
    touchesAuth: opts.categories.includes('SECURITY'),
    touchesDatabase: opts.categories.includes('DATABASE'),
    touchesUI: opts.categories.includes('UI'),
    touchesTests: opts.categories.includes('TEST'),
    categories: opts.categories,
    message: opts.message
  };
}
