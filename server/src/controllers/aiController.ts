import { Response } from 'express';
import { db } from '../database/db';
import { AuthenticatedRequest } from '../middleware/auth';
import { SocialPlatform } from '../types';
import { AIService } from '../services/ai/ai.service';
import { AnalyticsService } from '../features/analytics/analytics.service';

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

  repurposeYoutube: async (_req: AuthenticatedRequest, res: Response) => {
    return res.status(501).json({
      message: 'YouTube repurpose is not supported yet: no transcript pipeline is available on this server.',
    });
  },

  repurposeBlog: async (_req: AuthenticatedRequest, res: Response) => {
    return res.status(501).json({
      message: 'Blog repurpose is not supported yet: no article ingestion pipeline is available on this server.',
    });
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
