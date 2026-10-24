import { computeCosineSimilarity } from '../../compliance/compliance.service';
import {
  buildPostPrompt,
  buildTwitterPostPrompt,
  buildThreadsPostPrompt,
  buildInstagramPostPrompt,
  buildLinkedInPostPrompt,
  buildStoryContext,
  PostVariant
} from '../content/prompts';
import { DEFAULT_DEVELOPER_STYLE } from '../content/style-analyzer';
import { projectHistoryService } from '../repositories/projectHistory.service';
import ProjectHistoryModel from '../repositories/projectHistory.model';
import { errorTrackerService } from '../content/errorTracker.service';
import AIErrorEventModel from '../content/aiErrorEvent.model';
import { DailyContentService } from '../jobs/dailyContent.service';
import { OpportunityRepository } from '../opportunities/opportunity.repository';
import { ContentService } from '../content/content.service';
import { mongoose } from '../../../database/db';

describe('Auto-publish architecture & feedback loop', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => mongoose.connection.once('open', resolve));
    }
  });

  afterAll(async () => {
    await ProjectHistoryModel.deleteMany({ userId: 'test_auto_user' });
    await AIErrorEventModel.deleteMany({ userId: 'test_auto_user' });
  });

  describe('Cosine similarity calculation', () => {
    it('returns 1.0 for identical texts', () => {
      const text = 'Refactored database connection pooling and eliminated connection leak bugs in production.';
      expect(computeCosineSimilarity(text, text)).toBeCloseTo(1.0, 2);
    });

    it('returns high similarity (>0.85) for minor word variations', () => {
      const text1 = 'Refactored database connection pooling and eliminated connection leak bugs in production today.';
      const text2 = 'Refactored database connection pooling and eliminated connection leak bugs in production yesterday.';
      expect(computeCosineSimilarity(text1, text2)).toBeGreaterThan(0.85);
    });

    it('returns low similarity (<0.3) for distinct technical topics', () => {
      const text1 = 'Implemented OAuth login with PKCE security for mobile clients.';
      const text2 = 'Optimized Docker container image build sizes using multi-stage builds and Alpine Linux.';
      expect(computeCosineSimilarity(text1, text2)).toBeLessThan(0.3);
    });

    it('handles empty strings gracefully', () => {
      expect(computeCosineSimilarity('', 'hello world')).toBe(0);
      expect(computeCosineSimilarity('', '')).toBe(0);
    });
  });

  describe('Platform-specific prompt builders', () => {
    const context = buildStoryContext({
      projectName: 'SocialFlow',
      activityTitle: 'Add OAuth PKCE',
      changes: ['Support code verifier', 'Validate code challenge'],
      affectedAreas: ['auth'],
      evidence: {
        prNumbers: [10],
        issueNumbers: [],
        commitShas: ['abc1'],
        commitCount: 1,
        fileCount: 2,
        totalAdditions: 80,
        totalDeletions: 10
      }
    });
    const style = DEFAULT_DEVELOPER_STYLE;

    it('builds Twitter prompt with strict 280 char constraint', () => {
      const { system, prompt } = buildPostPrompt('short_casual', context, style, undefined, null, 'twitter');
      expect(system).toContain('280 characters');
      expect(prompt).toContain('280 characters');
    });

    it('builds Threads prompt with 500 char constraint', () => {
      const { system, prompt } = buildPostPrompt('short_casual', context, style, undefined, null, 'threads');
      expect(system).toContain('500 characters');
      expect(prompt).toContain('500 characters');
    });

    it('builds Instagram prompt with hashtags requirement', () => {
      const { system } = buildPostPrompt('story', context, style, undefined, null, 'instagram');
      expect(system).toContain('Instagram');
      expect(system).toContain('hashtags');
    });

    it('builds LinkedIn prompt for default or linkedin platform', () => {
      const { system } = buildPostPrompt('story', context, style, undefined, null, 'linkedin');
      expect(system).toContain('LinkedIn');
    });

    it('supports new variants: first_post, returning, day_summary, single_milestone', () => {
      const variants: PostVariant[] = ['first_post', 'returning', 'day_summary', 'single_milestone'];
      for (const v of variants) {
        const { prompt } = buildPostPrompt(v, context, style, undefined, null, 'linkedin');
        expect(prompt).toBeDefined();
        expect(prompt.length).toBeGreaterThan(20);
      }
    });
  });

  describe('Project history tracking & variant recommendation', () => {
    const userId = 'test_auto_user';
    const repoId = 'repo_arch_123';

    beforeEach(async () => {
      await ProjectHistoryModel.deleteMany({ userId, repositoryId: repoId });
    });

    it('recommends first_post when project has 0 posts published', async () => {
      const rec = await projectHistoryService.recommendVariant(userId, repoId);
      expect(rec).toBe('first_post');
    });

    it('recommends returning when project was last posted over 14 days ago', async () => {
      const oldDate = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
      await ProjectHistoryModel.create({
        userId,
        repositoryId: repoId,
        totalPostsPublished: 2,
        lastPostedAt: oldDate
      });

      const rec = await projectHistoryService.recommendVariant(userId, repoId);
      expect(rec).toBe('returning');
    });

    it('recommends single_milestone when activity is a milestone', async () => {
      await ProjectHistoryModel.create({
        userId,
        repositoryId: repoId,
        totalPostsPublished: 2,
        lastPostedAt: new Date()
      });

      const rec = await projectHistoryService.recommendVariant(userId, repoId, { isMilestone: true });
      expect(rec).toBe('single_milestone');
    });

    it('recommends day_summary when multiple activities are aggregated', async () => {
      await ProjectHistoryModel.create({
        userId,
        repositoryId: repoId,
        totalPostsPublished: 2,
        lastPostedAt: new Date()
      });

      const rec = await projectHistoryService.recommendVariant(userId, repoId, { activityCount: 3 });
      expect(rec).toBe('day_summary');
    });

    it('records post publication and increments counter', async () => {
      await projectHistoryService.recordPublishedPost(userId, repoId, 'draft_101', ['auth', 'pkce']);
      const history = await projectHistoryService.getHistory(userId, repoId);
      expect(history.totalPostsPublished).toBe(1);
      expect(history.publishedDraftIds).toContain('draft_101');
      expect(history.topicsCovered).toContain('auth');
    });
  });

  describe('Error tracker & self-improvement feedback loop', () => {
    const userId = 'test_auto_user';

    beforeEach(async () => {
      await AIErrorEventModel.deleteMany({ userId });
    });

    it('records error event and derives avoidance hint', async () => {
      const event = await errorTrackerService.recordError({
        userId,
        repositoryId: 'repo_1',
        errorType: 'fact_check_failure',
        message: 'Percentage claim not supported by evidence: "50% faster"'
      });

      expect(event).not.toBeNull();
      expect(event?.avoidanceHint).toContain('percentages');
    });

    it('returns avoidance hints to feed back into future prompts', async () => {
      await errorTrackerService.recordError({
        userId,
        repositoryId: 'repo_1',
        errorType: 'fact_check_failure',
        message: 'Percentage claim not supported: 30%'
      });
      await errorTrackerService.recordError({
        userId,
        repositoryId: 'repo_1',
        errorType: 'validation_failure',
        message: 'Reasoning leak detected'
      });

      const hints = await errorTrackerService.getAvoidanceHints(userId, 'repo_1');
      expect(hints.length).toBeGreaterThanOrEqual(1);
      expect(hints.some((h) => h.includes('percentages') || h.includes('thinking'))).toBe(true);
    });
  });

  describe('Daily window timing', () => {
    const dailyService = new DailyContentService({} as any, {} as any);

    it('detects window due at 17:30 or later', () => {
      const at530 = new Date('2026-10-24T17:30:00');
      const at529 = new Date('2026-10-24T17:29:59');
      const at600 = new Date('2026-10-24T18:00:00');
      const at900 = new Date('2026-10-24T09:00:00');

      expect(dailyService.isWindowDue(at530)).toBe(true);
      expect(dailyService.isWindowDue(at600)).toBe(true);
      expect(dailyService.isWindowDue(at529)).toBe(false);
      expect(dailyService.isWindowDue(at900)).toBe(false);
    });

    it('schedules post for 18:00 when triggered at 17:30', () => {
      const at530 = new Date('2026-10-24T17:30:00');
      const scheduled = dailyService.calculateScheduledTime(at530);
      expect(scheduled.getHours()).toBe(18);
      expect(scheduled.getMinutes()).toBe(0);
    });
  });
});
