import mongoose from 'mongoose';
import { DraftPublisher } from '../draft.publisher';
import { DraftRepository } from '../draft.repository';
import { PostRepository } from '../../post/post.repository';
import { SocialRepository } from '../../social/social.repository';
import { PublishHistoryRepository } from '../publishHistory.repository';
import { NotificationService } from '../../notification/notification.service';
import { runPostDeliveries } from '../../../services/scheduler';
import { FANOUT_CONFIRM_THRESHOLD } from '../../social/targeting';

/**
 * Draft publishing with account-level targeting:
 * - explicit snapshot wins (a newly connected account never joins)
 * - legacy drafts (no targetAccountIds) keep the historical fan-out
 * - empty selections are rejected at queue/publish time
 * - fan-out confirmation is enforced at the queue boundary
 * - retries/idempotency keep using the existing Post deliveries
 */

jest.mock('../../../services/scheduler');
jest.mock('../../post/post.repository');
jest.mock('../../social/social.repository');
jest.mock('../publishHistory.repository');
jest.mock('../../notification/notification.service');

async function rejected(p: Promise<any>): Promise<any> {
  try {
    await p;
  } catch (err: any) {
    return err;
  }
  throw new Error('expected the promise to reject');
}

const acc = (username: string, over: Record<string, any> = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  userId: 'user_a',
  platform: 'twitter',
  username,
  displayName: username,
  status: 'active',
  connectionStatus: 'connected',
  ...over
});

describe('DraftPublisher — account-level targeting', () => {
  let publisher: DraftPublisher;
  let draftRepo: jest.Mocked<DraftRepository>;
  let pool: any[];
  let createdPosts: any[];
  let finalDraft: any;

  const makeDraft = (over: Record<string, any> = {}): any => ({
    _id: new mongoose.Types.ObjectId(),
    userId: 'user_a',
    platform: 'twitter',
    contentType: 'post',
    caption: 'draft caption',
    media: [],
    status: 'draft',
    ...over
  });

  beforeEach(() => {
    jest.clearAllMocks();
    pool = [];
    createdPosts = [];
    finalDraft = makeDraft({ status: 'published' });

    draftRepo = {
      findById: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockImplementation(async (_id: string, data: any) => ({ ...finalDraft, ...data })),
      markFailed: jest.fn().mockResolvedValue(true),
      markPublished: jest.fn().mockResolvedValue(true),
      archive: jest.fn().mockResolvedValue(true)
    } as any;

    publisher = new DraftPublisher(draftRepo);

    const postRepo = (publisher as any).postRepository as jest.Mocked<PostRepository>;
    const socialRepo = (publisher as any).socialRepository as jest.Mocked<SocialRepository>;
    const historyRepo = (publisher as any).publishHistoryRepository as jest.Mocked<PublishHistoryRepository>;
    const notifier = (publisher as any).notificationService as jest.Mocked<NotificationService>;

    socialRepo.findAccountsByUserId.mockImplementation(async (userId: string) =>
      pool.filter((a) => a.userId === userId)
    );
    socialRepo.findAccountsByIds.mockImplementation(async (userId: string, ids: string[]) =>
      pool.filter((a) => a.userId === userId && ids.includes(a._id.toString()))
    );
    postRepo.findByDraftId.mockResolvedValue(null);
    postRepo.createPost.mockImplementation(async (data: any) => {
      createdPosts.push(data);
      return { _id: data._id, ...data } as any;
    });
    postRepo.findPostById.mockImplementation(async (id: string) => {
      // Post after a fully successful run: every delivery published.
      const created = createdPosts[0];
      if (!created) return null;
      return {
        ...created,
        _id: id,
        deliveries: (created.deliveries || []).map((d: any) => ({
          ...d,
          status: 'published',
          externalPostId: 'ext_1'
        }))
      } as any;
    });
    historyRepo.getNextAttemptNumber.mockResolvedValue(1);
    historyRepo.recordAttempt.mockResolvedValue(undefined as any);
    notifier.create.mockResolvedValue(undefined as any);
    (runPostDeliveries as jest.Mock).mockResolvedValue(undefined);
  });

  describe('publishDraft with explicit targets', () => {
    it('builds deliveries only for the snapshot accounts (newly connected accounts are excluded)', async () => {
      const a = acc('a');
      const newlyConnected = acc('later');
      pool.push(a, newlyConnected); // findAccountsByUserId would return both
      const draft = makeDraft({ targetAccountIds: [a._id.toString()] });

      await publisher.publishDraft(draft as any);

      expect(createdPosts).toHaveLength(1);
      const postDoc = createdPosts[0];
      expect(postDoc.deliveries.map((d: any) => d.socialAccountId)).toEqual([a._id.toString()]);
      expect(postDoc.targetAccountIds).toEqual([a._id.toString()]);
      // The legacy fan-out query is never consulted for targeted drafts.
      expect((publisher as any).socialRepository.findAccountsByUserId).not.toHaveBeenCalled();
      expect(runPostDeliveries).toHaveBeenCalled();
    });

    it('rejects an empty selection instead of publishing everywhere', async () => {
      const draft = makeDraft({ targetAccountIds: [] });

      const result = await publisher.publishDraft(draft as any);

      expect(draftRepo.markFailed).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('No target accounts selected')
      );
      expect((publisher as any).postRepository.createPost).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('fails the draft (not the scheduler) when a target became invalid', async () => {
      const draft = makeDraft({ targetAccountIds: [new mongoose.Types.ObjectId().toString()] }); // nobody owns it

      await publisher.publishDraft(draft as any);

      expect(draftRepo.markFailed).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('invalid or unavailable')
      );
      expect((publisher as any).postRepository.createPost).not.toHaveBeenCalled();
    });
  });

  describe('publishDraft legacy compatibility', () => {
    it('fans out to every connected account of the platform when no targets were ever set', async () => {
      pool.push(acc('a'), acc('b'), acc('ig', { platform: 'instagram' }));
      const draft = makeDraft(); // no targetAccountIds field

      await publisher.publishDraft(draft as any);

      const postDoc = createdPosts[0];
      expect(postDoc.deliveries.map((d: any) => d.socialAccountId).sort()).toEqual(
        [pool[0]._id.toString(), pool[1]._id.toString()].sort()
      );
      expect(postDoc.targetAccountIds).toBeUndefined();
    });

    it('still fails when the platform has no connected accounts at all', async () => {
      const draft = makeDraft();

      await publisher.publishDraft(draft as any);

      expect(draftRepo.markFailed).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('No connected twitter account')
      );
      expect((publisher as any).postRepository.createPost).not.toHaveBeenCalled();
    });
  });

  describe('queueForPublishing — targets resolved before scheduling', () => {
    it('rejects an empty selection with a clear message', async () => {
      draftRepo.findById.mockResolvedValue(makeDraft({ targetAccountIds: [] }) as any);

      const err = await rejected(publisher.queueForPublishing('d1', 'user_a'));
      expect(err.statusCode).toBe(400);
      expect(err.message).toBe('Select at least one account before scheduling this draft.');
      expect(draftRepo.update).not.toHaveBeenCalled();
    });

    it('rejects a foreign target account', async () => {
      pool.push(acc('foreign', { userId: 'user_b' }));
      draftRepo.findById.mockResolvedValue(
        makeDraft({ targetAccountIds: [pool[0]._id.toString()] }) as any
      );

      const err = await rejected(publisher.queueForPublishing('d1', 'user_a'));
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('invalid or unavailable');
      expect(draftRepo.update).not.toHaveBeenCalled();
    });

    it('rejects a wrong-platform target account', async () => {
      pool.push(acc('company', { platform: 'linkedin' }));
      draftRepo.findById.mockResolvedValue(
        makeDraft({ targetAccountIds: [pool[0]._id.toString()] }) as any
      );

      const err = await rejected(publisher.queueForPublishing('d1', 'user_a'));
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('linkedin account');
    });

    it('enforces the fan-out confirmation at the queue boundary', async () => {
      const ids: string[] = [];
      for (let i = 0; i < FANOUT_CONFIRM_THRESHOLD; i++) {
        const a = acc(`u${i}`);
        pool.push(a);
        ids.push(a._id.toString());
      }
      draftRepo.findById.mockResolvedValue(makeDraft({ targetAccountIds: ids }) as any);

      const err = await rejected(publisher.queueForPublishing('d1', 'user_a'));
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain(`You're about to publish this post to ${FANOUT_CONFIRM_THRESHOLD} accounts`);
      expect(draftRepo.update).not.toHaveBeenCalled();

      await publisher.queueForPublishing('d1', 'user_a', undefined, true);
      expect(draftRepo.update).toHaveBeenCalledWith(
        'd1',
        expect.objectContaining({ status: 'ready' })
      );
    });

    it('queues legacy drafts without any target validation (historical behavior)', async () => {
      draftRepo.findById.mockResolvedValue(makeDraft());

      await publisher.queueForPublishing('d1', 'user_a');

      expect(draftRepo.update).toHaveBeenCalledWith(
        'd1',
        expect.objectContaining({ status: 'ready' })
      );
      expect((publisher as any).socialRepository.findAccountsByIds).not.toHaveBeenCalled();
    });
  });

  describe('idempotency and retries', () => {
    it('skips when the draft already has an in-flight Post (no duplicate external posts)', async () => {
      draftRepo.findById.mockResolvedValue(makeDraft({ status: 'publishing' }) as any);
      (publisher as any).postRepository.findByDraftId.mockResolvedValue({ status: 'publishing' } as any);

      await publisher.publishDraft(makeDraft({ status: 'publishing' }) as any);

      expect((publisher as any).postRepository.createPost).not.toHaveBeenCalled();
      expect(runPostDeliveries).not.toHaveBeenCalled();
    });

    it('retries only the existing Post deliveries — never rebuilds targets', async () => {
      const a = acc('a');
      pool.push(a, acc('b'));
      const existing = {
        _id: new mongoose.Types.ObjectId(),
        status: 'failed',
        userId: 'user_a',
        platforms: ['twitter'],
        draftId: 'd1',
        deliveries: [
          {
            socialAccountId: a._id.toString(),
            platform: 'twitter',
            status: 'failed',
            attempts: 1,
            maxAttempts: 5,
            deadLettered: false,
            idempotencyKey: `post:x:${a._id.toString()}:1`
          }
        ]
      };
      (publisher as any).postRepository.findByDraftId.mockResolvedValue(existing as any);
      (publisher as any).postRepository.findPostById.mockResolvedValue(existing as any);
      draftRepo.findById.mockResolvedValue(makeDraft({ status: 'ready' }) as any);

      await publisher.publishDraft(makeDraft({ status: 'ready', targetAccountIds: [a._id.toString()] }) as any);

      expect(runPostDeliveries).toHaveBeenCalledWith(existing, ['pending', 'failed']);
      expect((publisher as any).postRepository.createPost).not.toHaveBeenCalled();
    });
  });
});
