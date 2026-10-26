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

export type PostVariant =
  | 'story'
  | 'technical'
  | 'short_casual'
  | 'first_post'
  | 'returning'
  | 'day_summary'
  | 'single_milestone';

export interface StoryContext {
  projectName: string;
  projectDescription: string;
  techStack: string[];
  journey: string[];
  problem: string;
  activityTitle: string;
  /** The single commit the post should describe; pins focus in large groups. */
  focusCommit?: string;
  changes: string[];
  affectedAreas: string[];
  evidence: FactCheckEvidence;
  relatedMemoryHints: string[];
  /** Topics already posted previously — avoids redundant content. */
  coveredTopics?: string[];
}

export interface FocusResult {
  changes: string[];
  focusCommit?: string;
}

/**
 * Evidence focus filter. When an activity groups many commits, the oldest
 * ones dilute the story and the model misattributes which commit did what.
 * Above the threshold, keep only the most recent messages (changes are
 * ordered newest-first; changes[0] is the primary commit, the same one the
 * activity title was built from) and pin it as focusCommit.
 * Pure.
 */
export function focusStoryEvidence(input: {
  changes: string[];
  commitCount: number;
  maxChanges?: number;
}): FocusResult {
  const max = input.maxChanges ?? 5;
  const focusCommit = input.changes[0]?.trim() || undefined;
  if (input.commitCount > 10 && input.changes.length > max) {
    return { changes: input.changes.slice(0, max), focusCommit };
  }
  return { changes: input.changes, focusCommit };
}

export function buildStoryContext(opts: {
  projectName: string;
  /** Intentionally unused by callers — see the rule at the top of this file. */
  projectDescription?: string;
  techStack?: string[];
  journey?: string[];
  problem?: string;
  activityTitle: string;
  focusCommit?: string;
  changes: string[];
  affectedAreas: string[];
  evidence: FactCheckEvidence;
  relatedMemoryHints?: string[];
  coveredTopics?: string[];
}): StoryContext {
  return {
    projectName: opts.projectName,
    projectDescription: opts.projectDescription ?? '',
    techStack: opts.techStack ?? [],
    journey: opts.journey ?? [],
    problem: opts.problem ?? '',
    activityTitle: opts.activityTitle,
    focusCommit: opts.focusCommit,
    changes: opts.changes,
    affectedAreas: opts.affectedAreas,
    evidence: opts.evidence,
    relatedMemoryHints: opts.relatedMemoryHints ?? [],
    coveredTopics: opts.coveredTopics ?? []
  };
}

/** Flatten context into the compact text block sent with the prompt. */
export function serializeStoryContext(ctx: StoryContext): string {
  const lines: string[] = [];
  lines.push(`Project: ${ctx.projectName}`);
  if (ctx.techStack.length) lines.push(`Tech stack: ${ctx.techStack.join(', ')}`);
  if (ctx.journey.length) lines.push(`Project journey: ${ctx.journey.join(' → ')}`);
  lines.push(`Work: ${ctx.activityTitle}`);
  if (ctx.focusCommit) {
    lines.push(`PRIMARY COMMIT — describe this specific work, not the group history: ${ctx.focusCommit}`);
  }
  if (ctx.coveredTopics && ctx.coveredTopics.length > 0) {
    lines.push('Already posted topics (continue the journey forward — do NOT re-announce these):');
    for (const t of ctx.coveredTopics) lines.push(`  - ${t}`);
  }
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
  platform?: string;
}

const VARIANT_INSTRUCTIONS: Record<PostVariant, string> = {
  story: 'Write a story-focused post: a clear hook, what the problem was, why it mattered, what you tried, the fix, and what you learned. Narrative arc preferred.',
  technical: 'Write a technical post: describe the problem, the technical approach, the concrete change (files/areas), and the result. Depth over narrative.',
  short_casual: 'Write a short, casual post: brief hook, 1-2 sentences of context, the fix, and a takeaway. Keep it under ~200 words.',
  first_post: 'Write an introductory post for this project: hook the reader on why this project exists, what core problem it solves, and highlight the latest work as a milestone. Welcoming and inspiring tone.',
  returning: 'Write an update announcing a return to this project after a pause: acknowledge restarting progress, describe the fresh energy/focus, and detail what was just built.',
  day_summary: "Write a daily digest of today's engineering accomplishments: summarize the key changes across commits/PRs, highlight the biggest win, and share next steps.",
  single_milestone: 'Write a milestone celebration post: clearly announce the significant achievement (major feature, release, or key fix), the engineering challenge overcome, and the impact.'
};

export function buildLinkedInPostPrompt(req: PostGenRequest): { system: string; prompt: string } {
  const system =
    'You write authentic LinkedIn posts for developers based ONLY on the provided project evidence.\n' +
    'RULES:\n' +
    '- Never invent facts: no unproven metrics, performance claims, user impact, or achievements.\n' +
    '- Only mention what the evidence supports (commits, PRs, issues, files, lines changed).\n' +
    '- Do not claim things were "completed" unless evidence shows it; use "working on" / "implementing" when appropriate.\n' +
    '- NATURAL DEVELOPER VOICE: Write in first person like a real human engineer sharing learnings with peers (fluent, natural, and engaging like ChatGPT conversational responses). Avoid robotic templates, cliché corporate hooks, or hype adjectives.\n' +
    '- CONTINUITY: If previously covered topics are noted in the context, do not re-explain them as brand new discoveries. Connect the narrative seamlessly with previous progress.\n' +
    '- READABILITY: Use natural paragraph breaks for clean mobile skimming. Code snippets or names should be accurate and backticked.\n' +
    '- Use hashtags sparingly and only the relevant ones (project/tech related); never dump generic tags.\n' +
    (req.customInstructions?.trim()
      ? 'USER CONTENT PREFERENCES (apply only insofar as they do not conflict with any rule above):\n' +
        req.customInstructions.trim() + '\n'
      : '') +
    'Follow this style guide:\n' + req.styleGuide;

  const prompt =
    `${VARIANT_INSTRUCTIONS[req.variant]}\n\n` +
    `=== PROJECT CONTEXT (verified evidence only) ===\n${req.storyContext}\n\n` +
    'Write the LinkedIn post now. Output only the post body.';

  return { system, prompt };
}

export function buildTwitterPostPrompt(req: PostGenRequest): { system: string; prompt: string } {
  const system =
    'You write authentic X/Twitter posts for developers based ONLY on verified project evidence.\n' +
    'RULES:\n' +
    '- CRITICAL: The post MUST be strictly UNDER 280 characters total. Keep it concise, punchy, and complete.\n' +
    '- Never invent facts, metrics, or claims outside the evidence.\n' +
    '- First-person developer voice, authentic and direct.\n' +
    '- At most 1-2 relevant hashtags.\n' +
    (req.customInstructions?.trim()
      ? 'USER CONTENT PREFERENCES:\n' + req.customInstructions.trim() + '\n'
      : '');

  const prompt =
    `${VARIANT_INSTRUCTIONS[req.variant]}\n` +
    'CRITICAL CONSTRAINT: Output must be under 280 characters.\n\n' +
    `=== PROJECT CONTEXT ===\n${req.storyContext}\n\n` +
    'Write the tweet now. Output only the tweet text.';

  return { system, prompt };
}

export function buildThreadsPostPrompt(req: PostGenRequest): { system: string; prompt: string } {
  const system =
    'You write engaging Meta Threads posts for developers based ONLY on verified project evidence.\n' +
    'RULES:\n' +
    '- CRITICAL: Keep under 500 characters total.\n' +
    '- Authentic developer conversational voice, clean bullet points or short paragraphs.\n' +
    '- Never invent unverified metrics or claims.\n' +
    (req.customInstructions?.trim()
      ? 'USER CONTENT PREFERENCES:\n' + req.customInstructions.trim() + '\n'
      : '');

  const prompt =
    `${VARIANT_INSTRUCTIONS[req.variant]}\n` +
    'CRITICAL CONSTRAINT: Output must be under 500 characters.\n\n' +
    `=== PROJECT CONTEXT ===\n${req.storyContext}\n\n` +
    'Write the Threads post now. Output only the post body.';

  return { system, prompt };
}

export function buildInstagramPostPrompt(req: PostGenRequest): { system: string; prompt: string } {
  const system =
    'You write engaging Instagram captions for developer projects based ONLY on verified project evidence.\n' +
    'RULES:\n' +
    '- Strong opening hook in the first line.\n' +
    '- Clean line breaks between short paragraphs for readability.\n' +
    '- 3-5 relevant developer/project hashtags at the end.\n' +
    '- Never invent unverified metrics.\n' +
    (req.customInstructions?.trim()
      ? 'USER CONTENT PREFERENCES:\n' + req.customInstructions.trim() + '\n'
      : '');

  const prompt =
    `${VARIANT_INSTRUCTIONS[req.variant]}\n\n` +
    `=== PROJECT CONTEXT ===\n${req.storyContext}\n\n` +
    'Write the Instagram caption now. Output only the caption.';

  return { system, prompt };
}

/** Build the full system+prompt pair for one variant and optional platform target. */
export function buildPostPrompt(
  variant: PostVariant,
  context: StoryContext,
  style: StyleProfile,
  styleInput?: StyleInput,
  customInstructions?: string | null,
  platform?: string
): { system: string; prompt: string } {
  const req: PostGenRequest = {
    variant,
    storyContext: serializeStoryContext(context),
    styleGuide: serializeStyleGuide(style) + '\n' + (styleInput ? serializeLearningContext(styleInput) : ''),
    customInstructions,
    platform
  };

  const p = (platform || '').toLowerCase();
  if (p === 'twitter' || p === 'x') {
    return buildTwitterPostPrompt(req);
  }
  if (p === 'threads') {
    return buildThreadsPostPrompt(req);
  }
  if (p === 'instagram') {
    return buildInstagramPostPrompt(req);
  }
  return buildLinkedInPostPrompt(req);
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
