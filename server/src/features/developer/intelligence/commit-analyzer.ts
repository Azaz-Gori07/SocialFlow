/**
 * Pure commit grouping. No DB, no IO — imported by the pipeline service and
 * exercised directly by unit tests.
 */

export interface GroupedActivity {
  id: string;
  type: 'pr_group' | 'standalone_commit';
  title: string;
  commitShas: string[];
  prNumber?: number;
  issueNumbers: number[];
  firstCommitDate: Date;
  lastCommitDate: Date;
  files: string[];
  totalAdditions: number;
  totalDeletions: number;
  categories: string[];
  affectedAreas: string[];
  summary: string;
}

export interface CommitRecord {
  id: string;
  sha: string;
  message: string;
  committedAt: Date;
  files: Array<{ filename: string; additions: number; deletions: number }>;
}

export interface PRRecord {
  id: string;
  number: number;
  title: string;
  sourceBranch: string | null;
  state: string;
  commitShas: string[];
  issueNumbers: number[];
}

/**
 * Vendor/generated paths excluded from evidence totals. A single
 * `node_modules` check-in can add millions of lines — counting it as
 * "work" produces absurd evidence (and absurd LinkedIn posts).
 */
const VENDOR_DIR_RE = /(^|\/)(node_modules|dist|build|out|coverage|\.next|\.nuxt|vendor|Pods|\.venv|venv|__pycache__|\.git|\.playwright-mcp|\.originkit)\//i;
const GENERATED_FILE_RE = /(\.min\.js|\.min\.css|\.bundle\.js|\.map|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Gemfile\.lock|composer\.lock)$/i;

export function isVendorPath(filename: string): boolean {
  return VENDOR_DIR_RE.test(filename) || GENERATED_FILE_RE.test(filename);
}

function meaningfulFiles(files: Array<{ filename: string; additions: number; deletions: number }>) {
  return files.filter((f) => !isVendorPath(f.filename));
}

/**
 * Group commits into activities.
 * Strategy: commits on the same PR → one activity; otherwise standalone.
 */
export function groupCommitsIntoActivities(
  commits: CommitRecord[],
  prs: PRRecord[]
): GroupedActivity[] {
  const activities: GroupedActivity[] = [];

  // Index commits by PR number using branch labels or direct PR association
  const prCommitMap = new Map<string, string[]>();
  for (const pr of prs) {
    for (const sha of pr.commitShas) {
      const list = prCommitMap.get(sha) ?? [];
      list.push(String(pr.number));
      prCommitMap.set(sha, list);
    }
  }

  // Group: commits that share a PR → one activity
  const prActivities = new Map<string, { commits: CommitRecord[]; pr: PRRecord }>();
  const usedCommitIds = new Set<string>();

  for (const pr of prs) {
    const key = `pr:${pr.number}`;
    prActivities.set(key, { commits: [], pr });
    for (const sha of pr.commitShas) {
      const c = commits.find((c) => c.sha === sha);
      if (c) {
        prActivities.get(key)!.commits.push(c);
        usedCommitIds.add(c.id);
      }
    }
  }

  for (const [key, { commits: prCommits, pr }] of prActivities) {
    if (prCommits.length === 0) continue;
    const sorted = prCommits.sort((a, b) => a.committedAt.getTime() - b.committedAt.getTime());
    const files = [...new Set(sorted.flatMap((c) => meaningfulFiles(c.files).map((f) => f.filename)))];
    activities.push({
      id: key,
      type: 'pr_group',
      title: pr.title,
      commitShas: sorted.map((c) => c.sha),
      prNumber: pr.number,
      issueNumbers: pr.issueNumbers,
      firstCommitDate: sorted[0].committedAt,
      lastCommitDate: sorted[sorted.length - 1].committedAt,
      files,
      totalAdditions: sorted.reduce((s, c) => s + meaningfulFiles(c.files).reduce((s, f) => s + f.additions, 0), 0),
      totalDeletions: sorted.reduce((s, c) => s + meaningfulFiles(c.files).reduce((s, f) => s + f.deletions, 0), 0),
      categories: [],
      affectedAreas: [],
      summary: summarizeChanges(files, sorted.map((c) => c.message))
    });
  }

  // Remaining commits → standalone activities
  const orphanCommits = commits
    .filter((c) => !usedCommitIds.has(c.id))
    .sort((a, b) => b.committedAt.getTime() - a.committedAt.getTime());

  // Try to group nearby orphan commits by similar filenames and time proximity
  const orphansUsed = new Set<string>();
  const orphanGroups: CommitRecord[][] = [];

  for (const commit of orphanCommits) {
    if (orphansUsed.has(commit.id)) continue;
    const group: CommitRecord[] = [commit];
    orphansUsed.add(commit.id);
    const commitFiles = new Set(commit.files.map((f) => f.filename));
    const timeWindow = 60 * 60 * 1000; // 1 hour

    for (const candidate of orphanCommits) {
      if (orphansUsed.has(candidate.id)) continue;
      if (candidate.committedAt.getTime() - commit.committedAt.getTime() > timeWindow) break;
      const overlap = candidate.files.some((f) => commitFiles.has(f.filename));
      if (overlap) {
        group.push(candidate);
        orphansUsed.add(candidate.id);
        for (const f of candidate.files) commitFiles.add(f.filename);
      }
    }
    orphanGroups.push(group);
  }

  for (const group of orphanGroups) {
    const files = [...new Set(group.flatMap((c) => meaningfulFiles(c.files).map((f) => f.filename)))];
    activities.push({
      id: `commit:${group[0].sha.slice(0, 8)}`,
      type: 'standalone_commit',
      title: summarizeChanges(files, group.map((c) => c.message)),
      commitShas: group.map((c) => c.sha),
      issueNumbers: extractIssueRefs(group.map((c) => c.message)),
      firstCommitDate: group[group.length - 1].committedAt,
      lastCommitDate: group[0].committedAt,
      files,
      totalAdditions: group.reduce((s, c) => s + meaningfulFiles(c.files).reduce((s, f) => s + f.additions, 0), 0),
      totalDeletions: group.reduce((s, c) => s + meaningfulFiles(c.files).reduce((s, f) => s + f.deletions, 0), 0),
      categories: [],
      affectedAreas: [],
      summary: summarizeChanges(files, group.map((c) => c.message))
    });
  }

  return activities.sort((a, b) => b.lastCommitDate.getTime() - a.lastCommitDate.getTime());
}

/** Extract issue references from commit messages (#142, #156, etc.) */
export function extractIssueRefs(messages: string[]): number[] {
  const refs = new Set<number>();
  for (const msg of messages) {
    for (const m of msg.matchAll(/#(\d+)/g)) {
      refs.add(parseInt(m[1], 10));
    }
  }
  return [...refs];
}

/** Generate a human-readable title from files + messages. */
export function summarizeChanges(files: string[], messages: string[]): string {
  if (messages.length === 1) {
    return messages[0].replace(/\n/g, ' ').slice(0, 120);
  }
  const firstMsg = messages[0].replace(/\n/g, ' ').trim();
  const modules = [...new Set(files.map((f) => f.split('/')[0]))].slice(0, 3).join(', ');
  if (modules) return `Changes to ${modules}: ${firstMsg.slice(0, 80)}`;
  return firstMsg.slice(0, 120);
}
