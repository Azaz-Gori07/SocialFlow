/**
 * Deterministic content-opportunity detection over detected activities.
 * Pure — consumed by the opportunity storage gate and, later, by the content
 * generation phase. No AI: trivial work must never reach the LLM.
 *
 * NOTE on the two gates: this module is the *candidate* rule. The opportunity
 * service applies its own, stricter storage gate (see opportunity.service.ts).
 * They are intentionally not merged.
 */

export type OpportunitySource = 'activity' | 'milestone' | 'memory';

export interface ContentOpportunity {
  id: string;
  title: string;
  type: string; // original activity type (FEATURE, BUG_FIX, ...)
  importance: string;
  importanceScore: number;
  reason: string; // why this is post-worthy
  sourceType: OpportunitySource;
  sourceId: string;
  evidence: {
    prNumbers: number[];
    issueNumbers: number[];
    commitShas: string[];
    commitCount: number;
    fileCount: number;
    totalAdditions: number;
    totalDeletions: number;
  };
  changes: string[];
  affectedAreas: string[];
  problem: string;
  detectedAt: string | Date;
}

/** Shape shared by Mongoose activity docs and the plain objects callers pass in. */
export interface ActivityLike {
  id: string;
  title: string;
  type: string;
  importance: string;
  importanceScore: number | null;
  problem?: string | null;
  changes?: string[];
  affectedAreas?: string[];
  isMilestone: boolean | null;
  linkedInWorthy: boolean | null;
  confidence?: number | null;
  evidence: Record<string, unknown>;
  detectedAt: string | Date;
}

export function detectContentOpportunities(activities: ActivityLike[]): ContentOpportunity[] {
  return activities
    .filter(isOpportunityCandidate)
    .map(toOpportunity)
    .sort((a, b) => b.importanceScore - a.importanceScore);
}

export function isOpportunityCandidate(a: ActivityLike): boolean {
  if (a.linkedInWorthy) return true;
  if (a.isMilestone) return true;
  // Fallback: high importance with multi-commit evidence is still interesting
  if (a.importance === 'HIGH' || a.importance === 'MILESTONE') return true;
  if (a.importance === 'MEDIUM' && (a.evidence as { commitCount?: number })?.commitCount !== undefined) return true;
  return false;
}

function toOpportunity(a: ActivityLike): ContentOpportunity {
  const evidence = a.evidence ?? {};
  return {
    id: a.id,
    title: a.title,
    type: a.type,
    importance: a.importance,
    importanceScore: a.importanceScore ?? 0,
    reason: buildReason(a),
    sourceType: a.isMilestone ? 'milestone' : 'activity',
    sourceId: a.id,
    evidence: {
      prNumbers: (evidence.prNumbers as number[]) ?? [],
      issueNumbers: (evidence.issueNumbers as number[]) ?? [],
      commitShas: (evidence.commitShas as string[]) ?? [],
      commitCount: (evidence.commitCount as number) ?? 0,
      fileCount: (evidence.fileCount as number) ?? 0,
      totalAdditions: (evidence.totalAdditions as number) ?? 0,
      totalDeletions: (evidence.totalDeletions as number) ?? 0
    },
    changes: a.changes ?? [],
    affectedAreas: a.affectedAreas ?? [],
    problem: a.problem ?? '',
    detectedAt: a.detectedAt
  };
}

export function buildReason(a: ActivityLike): string {
  if (a.isMilestone) return 'Milestone-level work with significant scope.';
  if (a.type === 'BUG_FIX' && a.importance === 'HIGH') return 'A difficult bug was solved — great debugging-story material.';
  if (a.type === 'FEATURE') return `Completed ${a.type.toLowerCase()} work worth sharing.`;
  if (a.type === 'REFACTOR' || a.type === 'ARCHITECTURE') return 'Architecture-level change — explains how the project evolved.';
  return `Important ${a.type.toLowerCase()} work detected (score ${a.importanceScore}/100).`;
}
