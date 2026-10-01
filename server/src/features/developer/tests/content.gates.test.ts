import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../../server';
import { mongoose } from '../../../database/db';
import { env } from '../../../shared/config/env.config';
import { factCheckPost, validatePost, FactCheckEvidence } from '../content/fact-checker';
import DraftModel from '../../draft/draft.model';
import DraftService from '../../draft/draft.service';
import DraftRepository from '../../draft/draft.repository';
import DeveloperRepositoryModel from '../repositories/repository.model';
import DeveloperActivityModel from '../activities/activity.model';
import DeveloperOpportunityModel from '../opportunities/opportunity.model';
import DeveloperMemoryModel from '../memory/memory.model';
import DeveloperSettingsModel from '../settings/settings.model';
import { contentService } from '../developer.routes';
import { AppError } from '../../../shared/errors/appError';

/**
 * Content safety gates (tests #15-16) and the developer → draft bridge (#17).
 *
 * The fact checker and validator are pure, so they are called directly. The
 * bridge is verified through the real DraftService and through the public
 * POST /api/drafts route, which is deliberately NOT feature-gated.
 */

const userId = 'user_content_1';
const token = jwt.sign({ id: userId, email: 'content@socialflow.ai' }, env.JWT_SECRET, { expiresIn: '15m' });

/** Evidence: 3 commits, 2 files, 230 additions — the "strong" case. */
const STRONG_EVIDENCE: FactCheckEvidence = {
  prNumbers: [156],
  issueNumbers: [],
  commitShas: ['a1', 'b2', 'c3'],
  commitCount: 3,
  fileCount: 2,
  totalAdditions: 230,
  totalDeletions: 15
};

/** Evidence: 1 commit, 1 file, 10 additions — too thin for a completion claim. */
const WEAK_EVIDENCE: FactCheckEvidence = {
  prNumbers: [],
  issueNumbers: [],
  commitShas: ['z9'],
  commitCount: 1,
  fileCount: 1,
  totalAdditions: 10,
  totalDeletions: 1
};

const draftService = new DraftService(new DraftRepository());

async function clearData(): Promise<void> {
  await Promise.all([
    DraftModel.deleteMany({ userId }),
    DeveloperRepositoryModel.deleteMany({}),
    DeveloperActivityModel.deleteMany({}),
    DeveloperOpportunityModel.deleteMany({}),
    DeveloperMemoryModel.deleteMany({}),
    DeveloperSettingsModel.deleteMany({ userId })
  ]);
}

describe('Developer content gates', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => mongoose.connection.once('open', resolve));
    }
  });

  // Inside the describe on purpose: jest runs a file-level afterAll after the
  // central setup has already disconnected, so teardown there would throw.
  afterAll(async () => {
    await clearData();
  });

  describe('factCheckPost — hallucinated claims are errors', () => {
    it('rejects a percentage claim that no evidence supports', () => {
      const result = factCheckPost(
        'This change improved coverage by 40% across the suite.',
        STRONG_EVIDENCE
      );

      expect(result.passed).toBe(false);
      const issue = result.issues.find((i) => i.matchedPhrase === '40%');
      expect(issue?.severity).toBe('error');
    });

    it('rejects an unmeasured performance claim', () => {
      const result = factCheckPost('Performance improved by 200ms per request.', STRONG_EVIDENCE);

      expect(result.passed).toBe(false);
      expect(result.issues.some((i) => i.severity === 'error')).toBe(true);
    });

    it('rejects a fabricated user-scale claim', () => {
      const result = factCheckPost('This now serves 10000 users per day.', STRONG_EVIDENCE);

      expect(result.passed).toBe(false);
      expect(result.issues.some((i) => i.matchedPhrase?.includes('10000'))).toBe(true);
    });

    it('rejects a diff-scale claim that exceeds the evidence total', () => {
      const result = factCheckPost('This touched 10000 commits in one go.', WEAK_EVIDENCE);

      expect(result.passed).toBe(false);
      const issue = result.issues.find((i) => i.message.includes('Inflated scale claim'));
      expect(issue?.severity).toBe('error');
    });

    it('warns — but does not fail — on a completion claim with weak evidence', () => {
      const result = factCheckPost('The feature is completed and ready to use.', WEAK_EVIDENCE);

      const warning = result.issues.find((i) => i.severity === 'warning');
      expect(warning?.message).toContain('Completion claim');
      // A warning alone must not block the post.
      expect(result.passed).toBe(true);
    });

    it('passes a post that only states what the evidence supports', () => {
      const post =
        'Pull request #156 landed the signup flow. Three commits touched the auth module, ' +
        'adding the signup endpoint, the validation rules, and coverage for both.';

      const result = factCheckPost(post, STRONG_EVIDENCE);

      expect(result.issues).toEqual([]);
      expect(result.passed).toBe(true);
    });
  });

  describe('validatePost — structure and reasoning-leak gates', () => {
    it('rejects a post under 30 words', () => {
      const result = validatePost('Shipped a thing. It works. See it.');

      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.message.includes('too short'))).toBe(true);
    });

    it('rejects a post that leaks the model’s thinking', () => {
      const result = validatePost(
        "Here's my thinking process for this post. First I considered the evidence, " +
          'then I drafted three variants and picked the strongest one before posting it here.'
      );

      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.message.includes('Reasoning leak'))).toBe(true);
    });

    it('rejects a raw tool-call block', () => {
      const result = validatePost(
        'Here is the update for this week across the auth module and the validation layer. ' +
          'We tightened the rules and added coverage. <|tool_call_start|> write_post({})'
      );

      expect(result.valid).toBe(false);
    });

    it('accepts a long, well-formed post', () => {
      const result = validatePost(
        'Pull request #156 landed the signup flow this week. It adds the endpoint, the ' +
          'validation rules that were failing silently, and a test file covering both. ' +
          'The interesting part was the retry logic: the original version swallowed errors, ' +
          'so a flaky network looked like a rejected signup. The fix moved the guard into ' +
          'the validation layer, which made the failure visible at the boundary instead. ' +
          'That is a small change, but it removed an entire class of support tickets.'
      );

      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
    });

    it('warns without failing on generic hashtags', () => {
      const result = validatePost(
        'Pull request #156 landed the signup flow with validation and coverage. The retry ' +
          'guard moved into the validation layer so flaky networks stopped looking like ' +
          'rejected signups. Small change, one less class of support ticket. #coding #ai'
      );

      expect(result.valid).toBe(true);
      expect(result.issues.some((i) => i.message.includes('Generic hashtag'))).toBe(true);
    });
  });

  describe('Draft bridge — provenance persistence', () => {
    beforeEach(async () => {
      await clearData();
    });

    it('persists every developer provenance field when supplied', async () => {
      const draft = await draftService.createDraft(
        {
          platform: 'linkedin',
          contentType: 'post',
          caption: 'Signup flow landed.',
          media: [],
          sourceType: 'developer_activity',
          developerActivityId: 'act_123',
          developerRepositoryId: 'repo_123',
          developerOpportunityId: 'opp_123',
          evidence: { prNumbers: [156], commitCount: 3 },
          aiMetadata: { variant: 'technical', opportunityTitle: 'Signup flow' }
        },
        userId
      );

      const stored = await DraftModel.findById(draft._id).exec();
      expect(stored?.sourceType).toBe('developer_activity');
      expect(stored?.developerActivityId).toBe('act_123');
      expect(stored?.developerRepositoryId).toBe('repo_123');
      expect(stored?.developerOpportunityId).toBe('opp_123');
      expect((stored?.evidence as { commitCount: number })?.commitCount).toBe(3);
      expect((stored?.aiMetadata as { variant: string })?.variant).toBe('technical');
    });

    it('leaves every developer field unset for a plain draft (backward compatible)', async () => {
      const draft = await draftService.createDraft(
        { platform: 'linkedin', contentType: 'post', caption: 'A plain draft.', media: [] },
        userId
      );

      const stored = await DraftModel.findById(draft._id).exec();
      expect(stored?.sourceType).toBeUndefined();
      expect(stored?.developerActivityId).toBeUndefined();
      expect(stored?.developerRepositoryId).toBeUndefined();
      expect(stored?.developerOpportunityId).toBeUndefined();
      expect(stored?.evidence).toBeUndefined();
      expect(stored?.aiMetadata).toBeUndefined();
    });

    it('accepts developer provenance over POST /api/drafts (route is not gated)', async () => {
      const response = await request(app)
        .post('/api/drafts')
        .set('Authorization', `Bearer ${token}`)
        .send({
          platform: 'linkedin',
          contentType: 'post',
          caption: 'API-created developer draft.',
          sourceType: 'developer_activity',
          developerActivityId: 'act_api',
          developerRepositoryId: 'repo_api',
          developerOpportunityId: 'opp_api',
          evidence: { commitCount: 2 },
          aiMetadata: { variant: 'story' }
        });

      expect(response.status).toBe(201);
      expect(response.body.data.developerRepositoryId).toBe('repo_api');

      const stored = await DraftModel.findById(response.body.data.id).exec();
      expect(stored?.sourceType).toBe('developer_activity');
      expect(stored?.developerActivityId).toBe('act_api');
      expect((stored?.aiMetadata as { variant: string })?.variant).toBe('story');
    });

    it('still creates a plain draft over the API when no provenance is sent', async () => {
      const response = await request(app)
        .post('/api/drafts')
        .set('Authorization', `Bearer ${token}`)
        .send({ platform: 'twitter', contentType: 'post', caption: 'No provenance here.' });

      expect(response.status).toBe(201);
      const stored = await DraftModel.findById(response.body.data.id).exec();
      expect(stored?.sourceType).toBeUndefined();
    });
  });

  describe('AI provider gate', () => {
    it('refuses to generate when no AI provider is configured', async () => {
      // The suite runs with no OpenRouter key, so ContentService must refuse
      // rather than fabricate content.
      expect(env.OPENROUTER_API_KEY).toBeFalsy();
      expect(env.OPENROUTER_API_KEY_MODEL).toBeFalsy();

      await clearData();
      const repo = await DeveloperRepositoryModel.create({
        userId,
        githubId: 'gh-content-1',
        name: 'r',
        fullName: 'o/r',
        lastSyncedAt: new Date()
      });
      const activity = await DeveloperActivityModel.create({
        userId,
        repositoryId: repo._id.toString(),
        title: 'Signup flow landed',
        type: 'FEATURE',
        importance: 'HIGH',
        importanceScore: 70,
        changes: ['feat: add signup flow'],
        affectedAreas: ['src'],
        isMilestone: false,
        linkedInWorthy: true,
        evidence: { prNumbers: [156], issueNumbers: [], commitShas: ['a'], commitCount: 3, fileCount: 2, totalAdditions: 230, totalDeletions: 15 },
        evidenceKey: JSON.stringify(['a']),
        confidence: 80,
        detectedAt: new Date(),
        commitIds: [],
        prIds: [],
        issueIds: []
      });
      const opportunity = await DeveloperOpportunityModel.create({
        userId,
        repositoryId: repo._id.toString(),
        activityId: activity._id.toString(),
        title: 'Signup flow landed',
        sourceType: 'activity',
        sourceId: activity._id.toString(),
        status: 'pending',
        metadata: { importance: 'HIGH', evidence: { commitCount: 3 } }
      });

      await expect(
        contentService.generateForOpportunity(userId, opportunity._id.toString())
      ).rejects.toThrow(AppError.providerNotConfigured('AI'));

      // Nothing may be persisted on a refused generation.
      expect(await DraftModel.countDocuments({ userId })).toBe(0);
    });

    it('refuses generation for an opportunity that is not a content candidate', async () => {
      await clearData();
      const repo = await DeveloperRepositoryModel.create({
        userId,
        githubId: 'gh-content-2',
        name: 'r',
        fullName: 'o/r2',
        lastSyncedAt: new Date()
      });
      const activity = await DeveloperActivityModel.create({
        userId,
        repositoryId: repo._id.toString(),
        title: 'Trivial typo fix',
        type: 'OTHER',
        importance: 'TRIVIAL',
        importanceScore: 1,
        changes: ['chore: typo'],
        affectedAreas: ['docs'],
        isMilestone: false,
        linkedInWorthy: false,
        evidence: { prNumbers: [], issueNumbers: [], commitShas: ['t'], commitCount: 1, fileCount: 1, totalAdditions: 1, totalDeletions: 1 },
        evidenceKey: JSON.stringify(['t']),
        confidence: 10,
        detectedAt: new Date(),
        commitIds: [],
        prIds: [],
        issueIds: []
      });
      const opportunity = await DeveloperOpportunityModel.create({
        userId,
        repositoryId: repo._id.toString(),
        activityId: activity._id.toString(),
        title: 'Trivial typo fix',
        sourceType: 'activity',
        sourceId: activity._id.toString(),
        status: 'pending',
        metadata: { importance: 'TRIVIAL' }
      });

      await expect(
        contentService.generateForOpportunity(userId, opportunity._id.toString())
      ).rejects.toThrow(
        AppError.badRequest('Activity is not a content opportunity (not post-worthy)')
      );
    });
  });
});
