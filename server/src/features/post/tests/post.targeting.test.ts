import mongoose from 'mongoose';
import { PostService } from '../post.service';
import { PostRepository } from '../post.repository';
import { SocialRepository } from '../../social/social.repository';
import { WorkspaceRepository } from '../../workspace/workspace.repository';
import { FANOUT_CONFIRM_THRESHOLD } from '../../social/targeting';

/**
 * Post creation/update with account-level targeting: deliveries are built
 * ONLY from validated targetAccountIds, the resolved snapshot is persisted,
 * and legacy payloads (no targetAccountIds) keep the historical fan-out.
 */

jest.mock('../post.repository');
jest.mock('../../social/social.repository');
jest.mock('../../workspace/workspace.repository');

const FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();

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

describe('PostService — account-level targeting', () => {
  let service: PostService;
  let mockPostRepository: jest.Mocked<PostRepository>;
  let mockSocialRepository: jest.Mocked<SocialRepository>;
  let pool: any[];

  const baseInput = (extra: Record<string, any> = {}): any => ({
    content: 'Hello targeted world',
    platforms: ['twitter'],
    status: 'scheduled',
    scheduledAt: FUTURE,
    media: [],
    platformContent: {},
    workspaceId: 'ws_1',
    ...extra
  });

  beforeEach(() => {
    jest.clearAllMocks();
    pool = [];
    mockPostRepository = new PostRepository() as jest.Mocked<PostRepository>;
    mockSocialRepository = new SocialRepository() as jest.Mocked<SocialRepository>;
    (WorkspaceRepository.prototype.findMember as jest.Mock).mockResolvedValue({ userId: 'user_a' });
    mockSocialRepository.findAccountsByIds.mockImplementation(
      async (userId: string, ids: string[]) => pool.filter((a) => a.userId === userId && ids.includes(a._id.toString()))
    );
    mockSocialRepository.findAccountsByUserId.mockImplementation(async (userId: string) =>
      pool.filter((a) => a.userId === userId)
    );
    mockPostRepository.createPost.mockImplementation(async (data: any) => ({ _id: 'pst_1', ...data }) as any);
    mockPostRepository.updatePost.mockImplementation(async (_id: string, data: any) => ({ _id, ...data }) as any);
    service = new PostService(mockPostRepository, mockSocialRepository);
  });

  describe('scheduled posts with explicit targets', () => {
    it('creates one delivery per selected account and stores the snapshot', async () => {
      const a = acc('a');
      const b = acc('b');
      pool.push(a, b);

      await service.createPost(baseInput({ targetAccountIds: [a._id.toString(), b._id.toString()] }), 'user_a');

      const payload = mockPostRepository.createPost.mock.calls[0][0] as any;
      expect(payload.deliveries.map((d: any) => d.socialAccountId)).toEqual([
        a._id.toString(),
        b._id.toString()
      ]);
      expect(payload.targetAccountIds).toEqual([a._id.toString(), b._id.toString()]);
    });

    it('never delivers to connected-but-unselected accounts', async () => {
      const a = acc('a');
      const b = acc('b');
      pool.push(a, b);

      await service.createPost(baseInput({ targetAccountIds: [a._id.toString()] }), 'user_a');

      const payload = mockPostRepository.createPost.mock.calls[0][0] as any;
      expect(payload.deliveries).toHaveLength(1);
      expect(payload.deliveries[0].socialAccountId).toBe(a._id.toString());
      expect(payload.deliveries[0].platform).toBe('twitter');
      // The legacy fan-out query is never used for explicit targeting.
      expect(mockSocialRepository.findAccountsByUserId).not.toHaveBeenCalled();
    });

    it('resolves targets exactly once — later account changes cannot alter the snapshot', async () => {
      const a = acc('a');
      pool.push(a);

      await service.createPost(baseInput({ targetAccountIds: [a._id.toString()] }), 'user_a');

      expect(mockSocialRepository.findAccountsByIds).toHaveBeenCalledTimes(1);

      // A brand-new account connects afterwards.
      pool.push(acc('newly_connected'));
      // Nothing re-resolves: the stored payload is already final.
      const payload = mockPostRepository.createPost.mock.calls[0][0] as any;
      expect(payload.deliveries).toHaveLength(1);
      expect(payload.targetAccountIds).toEqual([a._id.toString()]);
    });

    it('ignores publishDefault — only the explicit selection is delivered to', async () => {
      const defaultAcc = acc('default_acc', { publishDefault: true });
      const chosen = acc('chosen');
      pool.push(defaultAcc, chosen);

      await service.createPost(baseInput({ targetAccountIds: [chosen._id.toString()] }), 'user_a');

      const payload = mockPostRepository.createPost.mock.calls[0][0] as any;
      expect(payload.deliveries.map((d: any) => d.socialAccountId)).toEqual([chosen._id.toString()]);
    });

    it('rejects an empty selection when scheduling', async () => {
      const err = await rejected(service.createPost(baseInput({ targetAccountIds: [] }), 'user_a'));
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('Select at least one target account');
      expect(mockPostRepository.createPost).not.toHaveBeenCalled();
    });

    it('rejects a foreign account id', async () => {
      pool.push(acc('foreign', { userId: 'user_b' }));
      const foreignId = pool[0]._id.toString();

      const err = await rejected(
        service.createPost(baseInput({ targetAccountIds: [foreignId] }), 'user_a')
      );
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('invalid or unavailable');
      expect(mockPostRepository.createPost).not.toHaveBeenCalled();
    });

    it('rejects a wrong-platform account id', async () => {
      pool.push(acc('company', { platform: 'linkedin' }));

      const err = await rejected(
        service.createPost(baseInput({ targetAccountIds: [pool[0]._id.toString()] }), 'user_a')
      );
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('linkedin account');
    });

    it('rejects a cross-workspace target', async () => {
      pool.push(acc('other_ws', { workspaceId: 'ws_other' }));

      const err = await rejected(
        service.createPost(baseInput({ targetAccountIds: [pool[0]._id.toString()] }), 'user_a')
      );
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('does not belong to this workspace');
    });

    it('rejects explicit targets without the active workspace', async () => {
      pool.push(acc('a'));

      const err = await rejected(
        service.createPost(baseInput({ targetAccountIds: [pool[0]._id.toString()], workspaceId: undefined }), 'user_a')
      );
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('workspaceId is required');
    });

    it('rejects a non-member of the workspace', async () => {
      pool.push(acc('a'));
      (WorkspaceRepository.prototype.findMember as jest.Mock).mockResolvedValue(null);

      const err = await rejected(
        service.createPost(baseInput({ targetAccountIds: [pool[0]._id.toString()] }), 'user_a')
      );
      expect(err.statusCode).toBe(403);
    });

    it('requires fan-out confirmation at the threshold', async () => {
      const ids: string[] = [];
      for (let i = 0; i < FANOUT_CONFIRM_THRESHOLD; i++) {
        const a = acc(`u${i}`);
        pool.push(a);
        ids.push(a._id.toString());
      }

      const err = await rejected(service.createPost(baseInput({ targetAccountIds: ids }), 'user_a'));
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain(`You're about to publish this post to ${FANOUT_CONFIRM_THRESHOLD} accounts`);
      expect(mockPostRepository.createPost).not.toHaveBeenCalled();

      await service.createPost(baseInput({ targetAccountIds: ids, confirmFanout: true }), 'user_a');
      const payload = mockPostRepository.createPost.mock.calls[0][0] as any;
      expect(payload.deliveries).toHaveLength(FANOUT_CONFIRM_THRESHOLD);
    });

    it('stores targets on draft posts without building deliveries yet', async () => {
      const a = acc('a');
      pool.push(a);

      await service.createPost(
        baseInput({ status: 'draft', scheduledAt: undefined, targetAccountIds: [a._id.toString()] }),
        'user_a'
      );

      const payload = mockPostRepository.createPost.mock.calls[0][0] as any;
      expect(payload.status).toBe('draft');
      expect(payload.deliveries).toEqual([]);
      expect(payload.targetAccountIds).toEqual([a._id.toString()]);
    });
  });

  describe('legacy payloads (no targetAccountIds)', () => {
    it('keeps the historical fan-out to all matching accounts', async () => {
      pool.push(acc('a'), acc('b'), acc('ig', { platform: 'instagram' }));

      await service.createPost(baseInput(), 'user_a');

      const payload = mockPostRepository.createPost.mock.calls[0][0] as any;
      expect(payload.deliveries.map((d: any) => d.socialAccountId).sort()).toEqual(
        [pool[0]._id.toString(), pool[1]._id.toString()].sort()
      );
      expect(payload.targetAccountIds).toBeUndefined();
    });

    it('still refuses to schedule when no account matches the platforms', async () => {
      pool.push(acc('ig', { platform: 'instagram' }));

      const err = await rejected(service.createPost(baseInput(), 'user_a'));
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('No connected account found for: twitter');
    });
  });

  describe('account-level outcomes stay distinct (no collapsed status)', () => {
    it('derives partial_failure when one account published and another failed', () => {
      const { PostRepository: RealPostRepository } = jest.requireActual('../post.repository');
      const repo = new RealPostRepository();
      const status = repo.deriveStatus([
        { status: 'published' },
        { status: 'failed' }
      ] as any);
      expect(status).toBe('partial_failure');
    });

    it('stays publishing while nothing has published yet and work remains', () => {
      const { PostRepository: RealPostRepository } = jest.requireActual('../post.repository');
      const repo = new RealPostRepository();
      const status = repo.deriveStatus([
        { status: 'failed' },
        { status: 'pending' }
      ] as any);
      expect(status).toBe('publishing');
    });
  });

  describe('updatePost — snapshot semantics', () => {
    const deliveryFor = (id: string, over: Record<string, any> = {}) => ({
      socialAccountId: id,
      platform: 'twitter',
      status: 'pending',
      idempotencyKey: `post:pst_1:${id}:1`,
      attempts: 0,
      maxAttempts: 5,
      deadLettered: false,
      ...over
    });

    const scheduledPost = (over: Record<string, any> = {}) => ({
      _id: new mongoose.Types.ObjectId(),
      userId: 'user_a',
      platforms: ['twitter'],
      content: 'x',
      media: [],
      status: 'scheduled',
      scheduledAt: FUTURE,
      scheduledAttempt: 1,
      deliveries: [],
      ...over
    });

    it('rebuilds pending deliveries when targets change on a scheduled post', async () => {
      const a = acc('a');
      const b = acc('b');
      pool.push(a, b);
      const post = scheduledPost({
        targetAccountIds: [a._id.toString()],
        deliveries: [deliveryFor(a._id.toString())]
      });
      mockPostRepository.findPostById.mockResolvedValue(post as any);

      await service.updatePost(
        'pst_1',
        { targetAccountIds: [b._id.toString()], workspaceId: 'ws_1' } as any,
        'user_a'
      );

      const update = mockPostRepository.updatePost.mock.calls[0][1] as any;
      expect(update.targetAccountIds).toEqual([b._id.toString()]);
      expect(update.deliveries.map((d: any) => d.socialAccountId)).toEqual([b._id.toString()]);
    });

    it('refuses target changes after a delivery attempt has started', async () => {
      const a = acc('a');
      const b = acc('b');
      pool.push(a, b);
      const post = scheduledPost({
        targetAccountIds: [a._id.toString()],
        deliveries: [deliveryFor(a._id.toString(), { attempts: 1, status: 'failed' })]
      });
      mockPostRepository.findPostById.mockResolvedValue(post as any);

      const err = await rejected(
        service.updatePost('pst_1', { targetAccountIds: [b._id.toString()], workspaceId: 'ws_1' } as any, 'user_a')
      );
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('cannot be changed after publishing has started');
      expect(mockPostRepository.updatePost).not.toHaveBeenCalled();
    });

    it('preserves deliveries when the same targets are re-sent (default on edit)', async () => {
      const a = acc('a');
      pool.push(a);
      const post = scheduledPost({
        targetAccountIds: [a._id.toString()],
        deliveries: [deliveryFor(a._id.toString())]
      });
      mockPostRepository.findPostById.mockResolvedValue(post as any);

      await service.updatePost(
        'pst_1',
        { content: 'edited content', targetAccountIds: [a._id.toString()], workspaceId: 'ws_1' } as any,
        'user_a'
      );

      const update = mockPostRepository.updatePost.mock.calls[0][1] as any;
      expect(update.content).toBe('edited content');
      expect(update.deliveries).toBeUndefined();
      expect(update.targetAccountIds).toEqual([a._id.toString()]);
    });

    it('arms a stored snapshot when a draft post is scheduled', async () => {
      const a = acc('a');
      pool.push(a);
      const post = scheduledPost({
        status: 'draft',
        scheduledAt: undefined,
        deliveries: [],
        targetAccountIds: [a._id.toString()]
      });
      mockPostRepository.findPostById.mockResolvedValue(post as any);

      await service.updatePost(
        'pst_1',
        { scheduledAt: FUTURE, workspaceId: 'ws_1' } as any,
        'user_a'
      );

      const update = mockPostRepository.updatePost.mock.calls[0][1] as any;
      expect(update.status).toBe('scheduled');
      expect(update.deliveries.map((d: any) => d.socialAccountId)).toEqual([a._id.toString()]);
    });

    it('rejects scheduling a stored empty selection', async () => {
      const post = scheduledPost({ status: 'draft', scheduledAt: undefined, deliveries: [], targetAccountIds: [] });
      mockPostRepository.findPostById.mockResolvedValue(post as any);

      const err = await rejected(service.updatePost('pst_1', { scheduledAt: FUTURE } as any, 'user_a'));
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('Select at least one account');
    });

    it('keeps the legacy fan-out for stored snapshots when scheduling old drafts', async () => {
      pool.push(acc('a'), acc('b'));
      const post = scheduledPost({ status: 'draft', scheduledAt: undefined, deliveries: [] });
      mockPostRepository.findPostById.mockResolvedValue(post as any);

      await service.updatePost('pst_1', { scheduledAt: FUTURE } as any, 'user_a');

      const update = mockPostRepository.updatePost.mock.calls[0][1] as any;
      expect(update.deliveries).toHaveLength(2);
      expect(update.targetAccountIds).toBeUndefined();
    });

    it('rejects an invalid target change against another user\'s account', async () => {
      pool.push(acc('foreign', { userId: 'user_b' }));
      const post = scheduledPost({
        targetAccountIds: [],
        deliveries: [deliveryFor('some_id')]
      });
      mockPostRepository.findPostById.mockResolvedValue(post as any);

      const err = await rejected(
        service.updatePost(
          'pst_1',
          { targetAccountIds: [pool[0]._id.toString()], workspaceId: 'ws_1' } as any,
          'user_a'
        )
      );
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('invalid or unavailable');
    });
  });
});
