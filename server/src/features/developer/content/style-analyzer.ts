/**
 * Writing-style profile derived from the user's own posts. Pure.
 * No history → an honest default developer voice, never an invented persona.
 */

export type WritingTone = 'technical' | 'casual' | 'founder' | 'learning' | 'storytelling' | 'short_form';

export interface StyleProfile {
  tone: WritingTone;
  sentenceLength: 'short' | 'medium' | 'long';
  emojiUsage: 'none' | 'sparse' | 'moderate';
  technicalDepth: 'beginner' | 'intermediate' | 'advanced';
  vocabulary: 'simple' | 'standard' | 'rich';
  formatting: 'paragraphs' | 'short_lines' | 'bullet_lists';
  hashtagStyle: 'none' | 'few' | 'some';
}

export interface StyleInput {
  /** Prior posts (optional). If absent, a default developer style is used. */
  previousPosts?: string[];
  /** Explicit user preference, e.g. from settings (optional override). */
  preferredTone?: WritingTone;
  /** Evidence-based learning signals to consider — sample-size signed. */
  learningContext?: string[];
  /** Topics already covered — the AI must not repeat them. */
  coveredTopics?: string[];
}

/** Heuristic metrics drawn from the user's actual previous posts. */
export interface StyleMetrics {
  avgSentenceLength: number;
  avgWords: number;
  emojiCount: number;
  hashtagCount: number;
  bulletCount: number;
}

export const DEFAULT_DEVELOPER_STYLE: StyleProfile = {
  tone: 'technical',
  sentenceLength: 'medium',
  emojiUsage: 'sparse',
  technicalDepth: 'intermediate',
  vocabulary: 'standard',
  formatting: 'paragraphs',
  hashtagStyle: 'few'
};

export function analyzeStyle(input: StyleInput): {
  profile: StyleProfile;
  metrics: StyleMetrics | null;
  fromHistory: boolean;
} {
  const posts = input.previousPosts?.filter((p) => p && p.trim().length > 0) ?? [];
  if (posts.length === 0) {
    const profile: StyleProfile = input.preferredTone
      ? { ...DEFAULT_DEVELOPER_STYLE, tone: input.preferredTone }
      : DEFAULT_DEVELOPER_STYLE;
    return { profile, metrics: null, fromHistory: false };
  }
  const metrics = computeMetrics(posts);
  const profile = deriveProfile(metrics, input.preferredTone);
  return { profile, metrics, fromHistory: true };
}

function computeMetrics(posts: string[]): StyleMetrics {
  let totalSentences = 0;
  let totalWords = 0;
  let emojiCount = 0;
  let hashtagCount = 0;
  let bulletCount = 0;
  const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;
  for (const post of posts) {
    const sentences = post.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim().length > 2);
    totalSentences += Math.max(1, sentences.length);
    totalWords += post.split(/\s+/).filter(Boolean).length;
    emojiCount += (post.match(EMOJI_RE) ?? []).length;
    hashtagCount += (post.match(/#\w+/g) ?? []).length;
    bulletCount += (post.match(/^\s*[-*•]/gm) ?? []).length;
  }
  return {
    avgSentenceLength: totalWords / Math.max(1, totalSentences),
    avgWords: totalWords / Math.max(1, posts.length),
    emojiCount: emojiCount / Math.max(1, posts.length),
    hashtagCount: hashtagCount / Math.max(1, posts.length),
    bulletCount: bulletCount / Math.max(1, posts.length)
  };
}

function deriveProfile(m: StyleMetrics, preferred?: WritingTone): StyleProfile {
  const sentenceLength: StyleProfile['sentenceLength'] =
    m.avgSentenceLength < 14 ? 'short' : m.avgSentenceLength > 24 ? 'long' : 'medium';
  const emojiUsage: StyleProfile['emojiUsage'] =
    m.emojiCount === 0 ? 'none' : m.emojiCount <= 2 ? 'sparse' : 'moderate';
  const technicalDepth: StyleProfile['technicalDepth'] =
    m.avgWords < 100 ? 'beginner' : m.avgWords > 250 ? 'advanced' : 'intermediate';
  return {
    tone: preferred ?? 'technical',
    sentenceLength,
    emojiUsage,
    technicalDepth,
    vocabulary: 'standard',
    formatting: m.bulletCount > 1 ? 'bullet_lists' : 'paragraphs',
    hashtagStyle: m.hashtagCount === 0 ? 'none' : m.hashtagCount <= 2 ? 'few' : 'some'
  };
}

/** Serialize the profile into prompt instructions for the LLM. */
export function serializeStyleGuide(profile: StyleProfile): string {
  const lines = [
    `- Tone: ${profile.tone}`,
    `- Sentence length: ${profile.sentenceLength}`,
    `- Emoji usage: ${profile.emojiUsage}`,
    `- Technical depth: ${profile.technicalDepth}`,
    `- Vocabulary: ${profile.vocabulary}`,
    `- Formatting: ${profile.formatting}`,
    `- Hashtags: ${profile.hashtagStyle} (only relevant ones, never generic tags like #coding #ai #tech)`
  ];
  return lines.join('\n');
}

/** Evidence-based learning context appended to the prompt. */
export function serializeLearningContext(input: StyleInput): string {
  const parts: string[] = [];
  if (input.learningContext && input.learningContext.length > 0) {
    parts.push('Historical performance (evidence-based, sample-size signed — treat as context, do not over-optimize):');
    for (const s of input.learningContext) parts.push(`- ${s}`);
  }
  if (input.coveredTopics && input.coveredTopics.length > 0) {
    parts.push(`Already covered topics (do NOT write a post about these again): ${input.coveredTopics.join(', ')}`);
  }
  return parts.join('\n');
}
