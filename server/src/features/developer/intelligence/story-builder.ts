/**
 * Evidence-backed story assembly. Pure.
 *
 * RULE: only state what the provided data supports. No invented metrics,
 * performance claims, or user impact unless present in the input.
 */

export interface DevStory {
  title: string;
  type: string;
  importance: string;
  importanceScore: number;
  problem: string;
  changes: string[];
  affectedAreas: string[];
  evidence: {
    prNumbers: number[];
    issueNumbers: number[];
    commitShas: string[];
    commitCount: number;
    fileCount: number;
    totalAdditions: number;
    totalDeletions: number;
  };
  confidence: number;
  linkedInWorthy: boolean;
  milestone?: { title: string; reason: string };
}

export interface StoryInput {
  title: string;
  type: string;
  importance: string;
  importanceScore: number;
  commitMessages: string[];
  commitShas: string[];
  files: string[];
  totalAdditions: number;
  totalDeletions: number;
  prNumbers: number[];
  issueNumbers: number[];
  affectedAreas: string[];
  milestone?: { title: string; reason: string };
}

export function buildStory(input: StoryInput): DevStory {
  const changes = buildChangeList(input.commitMessages);
  const problem = buildProblemStatement(input);

  const confidence =
    Math.min(100, 50 + input.prNumbers.length * 10 + input.issueNumbers.length * 5 + input.commitShas.length * 3);

  return {
    title: input.title,
    type: input.type,
    importance: input.importance,
    importanceScore: input.importanceScore,
    problem,
    changes,
    affectedAreas: input.affectedAreas,
    evidence: {
      prNumbers: input.prNumbers,
      issueNumbers: input.issueNumbers,
      commitShas: input.commitShas,
      commitCount: input.commitShas.length,
      fileCount: input.files.length,
      totalAdditions: input.totalAdditions,
      totalDeletions: input.totalDeletions
    },
    confidence,
    linkedInWorthy: input.importance === 'HIGH' || input.importance === 'MILESTONE',
    milestone: input.milestone
  };
}

export function buildChangeList(messages: string[]): string[] {
  const seen = new Set<string>();
  const changes: string[] = [];
  for (const msg of messages) {
    const clean = msg.replace(/\n/g, ' ').trim();
    const line = clean.slice(0, 120);
    if (seen.has(line)) continue;
    seen.add(line);
    changes.push(line);
  }
  return changes.slice(0, 10);
}

export function buildProblemStatement(input: StoryInput): string {
  // Only derive from actual data: linked issues suggest problems addressed.
  if (input.issueNumbers.length > 0) {
    return `Addressed ${input.issueNumbers.length} issue(s) related to this work.`;
  }
  // No issues linked → we cannot claim a specific problem.
  return `Development work completed across ${input.files.length} file(s).`;
}
