import { Response } from 'express';
import { db } from '../database/db';
import { AuthenticatedRequest } from '../middleware/auth';
import { SocialPlatform } from '../types';
import { AIService } from '../services/ai/ai.service';
import { AnalyticsService } from '../features/analytics/analytics.service';
import { AppError } from '../shared/errors/appError';

const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '169.254.169.254',
  'metadata.google.internal',
]);

function assertSafeUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw AppError.badRequest('A valid URL is required');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw AppError.badRequest('Only http(s) URLs are supported');
  }
  const host = parsed.hostname.toLowerCase();
  if (
    BLOCKED_HOSTS.has(host) ||
    host.endsWith('.internal') ||
    host.endsWith('.local') ||
    host.endsWith('.localhost')
  ) {
    throw AppError.badRequest('Refusing to fetch an internal or restricted address');
  }
  return parsed;
}

const GENERATION_PROMPT = (prompt: string) =>
  `You are a social media copywriter. Write a short post for each platform for this announcement: "${prompt}".

Return ONLY valid JSON with this exact shape, one key per platform:
{"twitter": "...", "linkedin": "...", "instagram": "...", "facebook": "...", "youtube": "...", "threads": "..."}

Rules:
- Twitter: under 280 characters, no hashtag stuffing.
- LinkedIn: professional tone, 2-4 short paragraphs.
- Instagram: casual, 2-5 lines.
- Facebook: friendly, 2-4 lines.
- YouTube: a video title plus a 2-3 sentence description.
- Threads: conversational, 1-3 punchy lines, under 500 characters.
- No markdown, no commentary outside the JSON.`;

const SUGGESTION_PROMPT = (message: string, author: string) =>
  `You are a social media manager drafting a reply to this comment on our social post.

Comment by @${author}: "${message}"

Return ONLY valid JSON: {"suggestions": ["reply 1", "reply 2", "reply 3"]}
Replies should be polite, specific to the comment, under 200 characters each, and must not invent features, pricing, or claims about the product.`;

export const AIController = {
  generatePost: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { prompt } = req.body;
      if (!prompt) return res.status(400).json({ message: 'Prompt is required' });

      const ai = new AIService();
      if (!ai.isConfigured) {
        return res.status(503).json({ message: 'AI provider is not configured on the server' });
      }

      const response = await ai.execute({ prompt: GENERATION_PROMPT(prompt) });
      const text = AIService.extractText(response.data);
      let outputs: Partial<Record<SocialPlatform, string>>;
      try {
        outputs = AIService.parseJson(text);
      } catch {
        return res.status(502).json({ message: 'AI provider did not return structured output' });
      }

      const generation = await db.aiGenerations.create({
        userId,
        prompt,
        outputs,
      });
      return res.status(201).json(generation);
    } catch (error) {
      console.error('AI generate post error', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },

  regeneratePost: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { prompt, platform } = req.body;
      if (!prompt || !platform) {
        return res.status(400).json({ message: 'Prompt and platform are required' });
      }

      const ai = new AIService();
      if (!ai.isConfigured) {
        return res.status(503).json({ message: 'AI provider is not configured on the server' });
      }

      const response = await ai.execute({
        prompt: `${GENERATION_PROMPT(prompt)}\nRegenerate only the "${platform}" variant, differently worded but with the same meaning.`,
      });
      const text = AIService.extractText(response.data);
      let outputs: Record<string, string>;
      try {
        outputs = AIService.parseJson(text);
      } catch {
        return res.status(502).json({ message: 'AI provider did not return structured output' });
      }

      const content = outputs[platform] || '';
      if (!content) {
        return res.status(502).json({ message: 'AI provider did not return content for the requested platform' });
      }
      return res.json({ platform, content });
    } catch (error) {
      console.error('AI regenerate error', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },

  suggestReply: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { commentId } = req.body;
      if (!commentId) return res.status(400).json({ message: 'Comment ID is required' });

      const comment = await db.comments.findOne({ _id: commentId });
      if (!comment) return res.status(404).json({ message: 'Comment not found' });

      const ai = new AIService();
      if (!ai.isConfigured) {
        return res.status(503).json({ message: 'AI provider is not configured on the server' });
      }

      const response = await ai.execute({
        prompt: SUGGESTION_PROMPT(comment.message, comment.author?.username || 'user'),
      });
      const text = AIService.extractText(response.data);
      let parsed: { suggestions?: string[] };
      try {
        parsed = AIService.parseJson(text);
      } catch {
        return res.status(502).json({ message: 'AI provider did not return structured output' });
      }

      return res.json({ suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [] });
    } catch (error) {
      console.error('AI reply suggestion error', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },

  repurposeYoutube: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { url } = req.body;
      if (!url || !/^https:\/\/(www\.)?youtube\.com\/|https:\/\/youtu\.be\//.test(String(url))) {
        return res.status(400).json({ message: 'A valid YouTube URL is required' });
      }

      const ai = new AIService();
      if (!ai.isConfigured) {
        return res.status(503).json({ message: 'AI provider is not configured on the server' });
      }

      // No transcript pipeline exists on the serverless host, so re-purpose from
      // the video's public metadata (oEmbed: title + author). That is real data
      // fetched live from YouTube — never fabricated.
      let oeRes: Awaited<ReturnType<typeof fetch>>;
      try {
        oeRes = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(String(url))}&format=json`,
          { signal: AbortSignal.timeout(10_000) }
        );
      } catch {
        return res.status(504).json({ message: 'YouTube metadata request timed out' });
      }
      if (!oeRes.ok) {
        return res.status(502).json({ message: 'YouTube metadata could not be fetched (video may be private)' });
      }
      const meta = (await oeRes.json()) as { title?: string; author_name?: string };

      const response = await ai.execute({
        prompt: `You are a social media manager. A new YouTube video was published: "${meta.title}" by ${meta.author_name || 'a creator'} (watch at ${url}).

Write launch posts for each platform announcing it, grounded ONLY in the title/channel above — do not invent plot details or claims.

Return ONLY valid JSON with one key per platform:
{"twitter": "...", "linkedin": "...", "instagram": "...", "facebook": "...", "youtube": "...", "threads": "..."}`,
      });
      const text = AIService.extractText(response.data);
      let outputs: Partial<Record<SocialPlatform, string>>;
      try {
        outputs = AIService.parseJson(text);
      } catch {
        return res.status(502).json({ message: 'AI provider did not return structured output' });
      }

      const generation = await db.aiGenerations.create({
        userId,
        prompt: `Repurpose YouTube video: ${meta.title || url}`,
        outputs,
      });
      return res.status(201).json(generation);
    } catch (error) {
      console.error('AI repurpose youtube error', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },

  repurposeBlog: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { url } = req.body;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ message: 'A valid blog URL is required' });
      }

      const ai = new AIService();
      if (!ai.isConfigured) {
        return res.status(503).json({ message: 'AI provider is not configured on the server' });
      }

      // Hard cap: an unbounded fetch used to hang the whole request (the client
      // aborted at 120s) and a multi-megabyte page could exhaust the function.
      let articleRes: Awaited<ReturnType<typeof fetch>>;
      try {
        const safeUrl = assertSafeUrl(url);
        articleRes = await fetch(safeUrl.toString(), {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SocialFlowBot/1.0)' },
          signal: AbortSignal.timeout(10_000)
        });
      } catch (fetchErr: any) {
        if (fetchErr instanceof AppError) {
          return res.status(fetchErr.statusCode).json({ message: fetchErr.message });
        }
        return res.status(504).json({ message: 'The blog could not be fetched in time' });
      }
      if (!articleRes.ok) {
        return res.status(502).json({ message: `The blog could not be fetched (${articleRes.status})` });
      }
      const html = (await articleRes.text()).slice(0, 2_000_000);
      // Strip script/style/tags, collapse whitespace: plain-text article body.
      const excerpt = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;|&amp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 6000);
      if (excerpt.length < 120) {
        return res.status(502).json({ message: 'The page fetched contains no readable article text' });
      }

      const response = await ai.execute({
        prompt: `You are a social media copywriter. Summarize this article into launch posts for every platform:\n\n"""${excerpt}"""\n\nReturn ONLY valid JSON with one key per platform:\n{"twitter": "...", "linkedin": "...", "instagram": "...", "facebook": "...", "youtube": "...", "threads": "..."}`,
      });
      const text = AIService.extractText(response.data);
      let outputs: Partial<Record<SocialPlatform, string>>;
      try {
        outputs = AIService.parseJson(text);
      } catch {
        return res.status(502).json({ message: 'AI provider did not return structured output' });
      }

      const generation = await db.aiGenerations.create({
        userId,
        prompt: `Repurpose blog article: ${String(url)}`,
        outputs,
      });
      return res.status(201).json(generation);
    } catch (error) {
      console.error('AI repurpose blog error', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },

  getInsights: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const insights = await AnalyticsService.getGrowthInsights(userId);
      return res.json(insights);
    } catch (error) {
      console.error('Get growth insights error', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },

  generateInsights: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const result = await AnalyticsService.syncMetrics(userId, 7);
      const insights = await AnalyticsService.getGrowthInsights(userId);
      return res.json({ insights, sync: result });
    } catch (error) {
      console.error('Generate insights error', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
};
