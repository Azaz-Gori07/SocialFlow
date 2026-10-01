/**
 * Story context assembly + LinkedIn post prompts. Pure.
 *
 * RULE (deliberate): the free-text repository description is NEVER fed to the
 * model. It is user meta-commentary, not verified evidence, and leaks into
 * posts as false claims about the work (e.g. "validation project" → "validation
 * UI"). Only activity evidence and memory written from evidence are allowed.
 */
import { FactCheckEvidence } from './fact-checker';
import { StyleProfile, serializeStyleGuide, serializeLearningContext, StyleInput } from './style-analyzer';

export type PostVariant = 'story' | 'technical' | 'short_casual';

export interface StoryContext {
  projectName: string;
  projectDescription: string;
  techStack: string[];
  journey: string[];
  problem: string;
  activityTitle: string;
  changes: string[];
  affectedAreas: string[];
  evidence: FactCheckEvidence;
  relatedMemoryHints: string[];
}

export function buildStoryContext(opts: {
  projectName: string;
  /** Intentionally unused by callers — see the rule at the top of this file. */
  projectDescription?: string;
  techStack?: string[];
  journey?: string[];
  problem?: string;
  activityTitle: string;
  changes: string[];
  affectedAreas: string[];
  evidence: FactCheckEvidence;
  relatedMemoryHints?: string[];
}): StoryContext {
  return {
    projectName: opts.projectName,
    projectDescription: opts.projectDescription ?? '',
    techStack: opts.techStack ?? [],
    journey: opts.journey ?? [],
    problem: opts.problem ?? '',
    activityTitle: opts.activityTitle,
    changes: opts.changes,
    affectedAreas: opts.affectedAreas,
    evidence: opts.evidence,
    relatedMemoryHints: opts.relatedMemoryHints ?? []
  };
}

/** Flatten context into the compact text block sent with the prompt. */
export function serializeStoryContext(ctx: StoryContext): string {
  const lines: string[] = [];
  lines.push(`Project: ${ctx.projectName}`);
  if (ctx.projectDescription) lines.push(`Description: ${ctx.projectDescription}`);
  if (ctx.techStack.length) lines.push(`Tech stack: ${ctx.techStack.join(', ')}`);
  if (ctx.journey.length) lines.push(`Project journey: ${ctx.journey.join(' → ')}`);
  lines.push(`Work: ${ctx.activityTitle}`);
  if (ctx.problem) lines.push(`Problem: ${ctx.problem}`);
  if (ctx.affectedAreas.length) lines.push(`Areas: ${ctx.affectedAreas.join(', ')}`);
  if (ctx.changes.length) {
    lines.push('Changes:');
    for (const c of ctx.changes) lines.push(`  - ${c}`);
  }
  lines.push('Evidence (only what is proven):');
  const ev = ctx.evidence;
  if (ev.prNumbers.length) lines.push(`  - PRs: #${ev.prNumbers.join(', #')}`);
  if (ev.issueNumbers.length) lines.push(`  - Issues: #${ev.issueNumbers.join(', #')}`);
  if (ev.commitCount) lines.push(`  - ${ev.commitCount} commits`);
  if (ev.totalAdditions || ev.totalDeletions) {
    lines.push(`  - Diff: +${ev.totalAdditions} / -${ev.totalDeletions} lines across ${ev.fileCount} files`);
  }
  if (ctx.relatedMemoryHints.length) {
    lines.push('Relevant history:');
    for (const m of ctx.relatedMemoryHints) lines.push(`  - ${m}`);
  }
  return lines.join('\n');
}

export interface PostGenRequest {
  variant: PostVariant;
  storyContext: string;
  styleGuide: string;
  /**
   * User's custom AI content instructions. Appended BELOW the system safety
   * rules so the priority is explicit and unbreakable:
   * factual rules → security/privacy → user instructions → style.
   * Never overrides evidence requirements or safety rules.
   */
  customInstructions?: string | null;
}

export function buildLinkedInPostPrompt(req: PostGenRequest): { system: string; prompt: string } {
  const variantInstructions: Record<PostVariant, string> = {
    story: 'Write a story-focused post: a clear hook, what the problem was, why it mattered, what you tried, the fix, and what you learned. Narrative arc preferred.',
    technical: 'Write a technical post: describe the problem, the technical approach, the concrete change (files/areas), and the result. Depth over narrative.',
    short_casual: 'Write a short, casual post: brief hook, 1-2 sentences of context, the fix, and a takeaway. Keep it under ~200 words.'
  };
  const system =
    'You write authentic LinkedIn posts for developers based ONLY on the provided project evidence.\n' +
    'RULES:\n' +
    '- Never invent facts: no unproven metrics, performance claims, user impact, or achievements.\n' +
    '- Only mention what the evidence supports (commits, PRs, issues, files, lines changed).\n' +
    '- Do not claim things were "completed" unless evidence shows it; use "working on" / "implementing" when appropriate.\n' +
    '- Write in first person as the developer, but keep a natural developer voice — no corporate buzzwords.\n' +
    '- Use hashtags sparingly and only the relevant ones (project/tech related); never dump generic tags.\n' +
    (req.customInstructions?.trim()
      ? 'USER CONTENT PREFERENCES (apply only insofar as they do not conflict with any rule above):\n' +
        req.customInstructions.trim() + '\n'
      : '') +
    'Follow this style guide:\n' + req.styleGuide;

  const prompt =
    `${variantInstructions[req.variant]}\n\n` +
    `=== PROJECT CONTEXT (verified evidence only) ===\n${req.storyContext}\n\n` +
    'Write the LinkedIn post now. Output only the post body.';

  return { system, prompt };
}

/** Build the full system+prompt pair for one variant. */
export function buildPostPrompt(
  variant: PostVariant,
  context: StoryContext,
  style: StyleProfile,
  styleInput?: StyleInput,
  customInstructions?: string | null
): { system: string; prompt: string } {
  return buildLinkedInPostPrompt({
    variant,
    storyContext: serializeStoryContext(context),
    styleGuide: serializeStyleGuide(style) + '\n' + (styleInput ? serializeLearningContext(styleInput) : ''),
    customInstructions
  });
}

/**
 * SocialFlow's AIService sends a single user message, so the system rules are
 * prepended to the prompt. Priority stays explicit and unbreakable.
 */
export function flattenPrompt(system: string, prompt: string): string {
  return `${system}\n\n---\n\n${prompt}`;
}

/** Strip accidental code fences wrapped around the whole output. */
export function trimPost(post: string): string {
  const t = post.trim();
  if (t.startsWith('```') && t.endsWith('```')) {
    return t.slice(3, -3).trim();
  }
  return t;
}
