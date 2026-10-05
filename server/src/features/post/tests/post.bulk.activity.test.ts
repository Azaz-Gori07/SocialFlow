import mongoose from 'mongoose';
import { PostService } from '../post.service';
import { PostRepository } from '../post.repository';
import { SocialRepository } from '../../social/social.repository';
import { WorkspaceRepository } from '../../workspace/workspace.repository';
import { logActivity } from '../../../shared/utils/activityLog';

/**
 * P3: CSV account_handle resolution (row-tagged, all-or-nothing, no silent
 * fallback) and the TARGET_ASSIGNED / CONTENT_SCHEDULED audit trail.
 */

jest.mock('../post.repository');
jest.mock('../../social/social.repository');
jest.mock('../../workspace/workspace.repository');
jest.mock('../../../shared/utils/activityLog');

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

describe('PostService — bulk CSV account_handles + activity log', () => {
  let service: PostService;
  let mockPostRepository: jest.Mocked<PostRepository>;
  let mockSocialRepository: jest.Mocked<SocialRepository>;
  let pool: any[];

  const row = (extra: Record<string, any> = {}) => ({
    content: 'csv row',
    platforms: ['twitter'],
    status: 'scheduled',
    scheduledAt: FUTURE,
    media: [],
    platformContent: {},
    ...extra
  });

  beforeEach(() => {
    jest.clearAllMocks();
    pool = [];
    mockPostRepository = new PostRepository() as jest.Mocked<PostRepository>;
    mockSocialRepository = new SocialRepository() as jest.Mocked<SocialRepository>;
    (WorkspaceRepository.prototype.findMember as jest.Mock).mockResolvedValue({ userId: 'user_a' });
    mockSocialRepository.findAccountsByUserId.mockImplementation(async (userId: string) =>
      pool.filter((a) => a.userId === userId)
    );
    mockSocialRepository.findAccountsByIds.mockImplementation(async (userId: string, ids: string[]) =>
      pool.filter((a) => a.userId === userId && ids.includes(a._id.toString()))
    );
    mockPostRepository.createPost.mockImplementation(async (data: any) => ({ _id: 'pst_bulk', ...data }) as any);
    service = new PostService(mockPostRepository, mockSocialRepository);
  });

  describe('account_handle resolution', () => {
    it('resolves handles to account ids for every row (server-side)', async () => {
      const a = acc('handle_a');
      const b = acc('handle_b');
      pool.push(a, b);

      await service.bulkCreatePosts(
        [
          row({ accountHandles: ['handle_a'], workspaceId: 'ws_1' }) as any,
          row({ accountHandles: ['HANDLE_B'], workspaceId: 'ws_1' }) as any
        ],
        'user_a'
      );

      expect(mockPostRepository.createPost).toHaveBeenCalledTimes(2);
      expect((mockPostRepository.createPost.mock.calls[0][0] as any).targetAccountIds).toEqual([
        a._id.toString()
      ]);
      expect((mockPostRepository.createPost.mock.calls[1][0] as any).targetAccountIds).toEqual([
        b._id.toString()
      ]);
      // handle column never persists on the post
      expect((mockPostRepository.createPost.mock.calls[0][0] as any).accountHandles).toBeUndefined();
    });

    it('rejects an unknown handle with a row-level error and creates NOTHING', async () => {
      pool.push(acc('known'));

      const err = await rejected(
        service.bulkCreatePosts(
          [
            row({ accountHandles: ['known'], workspaceId: 'ws_1' }) as any,
            row({ accountHandles: ['ghost_handle'], workspaceId: 'ws_1' }) as any
          ],
          'user_a'
        )
      );

      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('Row 2: unknown account handle "@ghost_handle"');
      expect(mockPostRepository.createPost).not.toHaveBeenCalled();
    });

    it('rejects a not-connected handle with a row-level error', async () => {
      pool.push(acc('expired_acc', { connectionStatus: 'expired' }));

      const err = await rejected(
        service.bulkCreatePosts(
          [row({ accountHandles: ['expired_acc'], workspaceId: 'ws_1' }) as any],
          'user_a'
        )
      );

      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('Row 1: account "@expired_acc" is not connected');
      expect(mockPostRepository.createPost).not.toHaveBeenCalled();
    });

    it('rejects handles rows that lack the active workspace', async () => {
      pool.push(acc('handle_a'));

      const err = await rejected(
        service.bulkCreatePosts([row({ accountHandles: ['handle_a'] }) as any], 'user_a')
      );

      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('Row 1: workspaceId is required when account handles are used');
      expect(mockPostRepository.createPost).not.toHaveBeenCalled();
    });

    it('keeps legacy rows (no handles) on the historical fan-out', async () => {
      pool.push(acc('a'), acc('b'));

      await service.bulkCreatePosts([row() as any], 'user_a');

      const payload = mockPostRepository.createPost.mock.calls[0][0] as any;
      expect(payload.targetAccountIds).toBeUndefined();
      expect(payload.deliveries).toHaveLength(2);
    });
  });

  describe('activity log (TARGET_ASSIGNED / CONTENT_SCHEDULED)', () => {
    const logged = (action: string) =>
      (logActivity as jest.Mock).mock.calls.map((c) => c[0]).find((e) => e.action === action);

    it('records both events for a scheduled post with explicit targets', async () => {
      const a = acc('a');
      pool.push(a);

      await service.createPost(
        {
          content: 'x',
          platforms: ['twitter'],
          status: 'scheduled',
          scheduledAt: FUTURE,
          media: [],
          platformContent: {},
          targetAccountIds: [a._id.toString()],
          workspaceId: 'ws_1',
          source: 'ai'
        } as any,
        'user_a'
      );

      const assigned = logged('TARGET_ASSIGNED');
      const scheduled = logged('CONTENT_SCHEDULED');
      expect(assigned).toBeDefined();
      expect(scheduled).toBeDefined();

      expect(assigned.meta.postId).toBe('pst_bulk');
      expect(assigned.meta.platforms).toEqual(['twitter']);
      expect(assigned.meta.targetAccountIds).toEqual([a._id.toString()]);
      expect(assigned.meta.source).toBe('ai');
      expect(assigned.meta.actor).toBe('user_a');
      expect(assigned.meta.workspaceId).toBe('ws_1');

      expect(scheduled.meta.scheduledAt).toBe(FUTURE);
      expect(scheduled.meta.targetAccountIds).toEqual([a._id.toString()]);
      expect(scheduled.meta.source).toBe('ai');
      expect(scheduled.meta.actor).toBe('user_a');
      expect(scheduled.meta.workspaceId).toBe('ws_1');
    });

    it('defaults source to manual — never fabricates ai provenance', async () => {
      const a = acc('a');
      pool.push(a);

      await service.createPost(
        {
          content: 'x',
          platforms: ['twitter'],
          status: 'scheduled',
          scheduledAt: FUTURE,
          media: [],
          platformContent: {},
          targetAccountIds: [a._id.toString()],
          workspaceId: 'ws_1'
        } as any,
        'user_a'
      );

      expect(logged('TARGET_ASSIGNED').meta.source).toBe('manual');
      expect(logged('CONTENT_SCHEDULED').meta.source).toBe('manual');
    });

    it('records only CONTENT_SCHEDULED for legacy fan-out scheduling', async () => {
      pool.push(acc('a'));

      await service.createPost(
        {
          content: 'x',
          platforms: ['twitter'],
          status: 'scheduled',
          scheduledAt: FUTURE,
          media: [],
          platformContent: {}
        } as any,
        'user_a'
      );

      expect(logged('TARGET_ASSIGNED')).toBeUndefined();
      const scheduled = logged('CONTENT_SCHEDULED');
      expect(scheduled).toBeDefined();
      expect(scheduled.meta.targetAccountIds).toHaveLength(1);
    });

    it('records only TARGET_ASSIGNED when a draft post gets targets (nothing scheduled yet)', async () => {
      const a = acc('a');
      pool.push(a);

      await service.createPost(
        {
          content: 'x',
          platforms: ['twitter'],
          status: 'draft',
          media: [],
          platformContent: {},
          targetAccountIds: [a._id.toString()],
          workspaceId: 'ws_1'
        } as any,
        'user_a'
      );

      expect(logged('TARGET_ASSIGNED')).toBeDefined();
      expect(logged('CONTENT_SCHEDULED')).toBeUndefined();
    });

    it('records TARGET_ASSIGNED when an update changes the target set', async () => {
      const a = acc('a');
      const b = acc('b');
      pool.push(a, b);
      const post: any = {
        _id: new mongoose.Types.ObjectId(),
        userId: 'user_a',
        platforms: ['twitter'],
        status: 'scheduled',
        scheduledAt: FUTURE,
        scheduledAttempt: 1,
        targetAccountIds: [a._id.toString()],
        deliveries: [
          {
            socialAccountId: a._id.toString(),
            platform: 'twitter',
            status: 'pending',
            attempts: 0,
            maxAttempts: 5,
            deadLettered: false,
            idempotencyKey: 'k1'
          }
        ]
      };
      mockPostRepository.findPostById.mockResolvedValue(post);
      mockPostRepository.updatePost.mockImplementation(async (id: string, data: any) => ({ _id: id, ...data }) as any);

      await service.updatePost(
        'pst_x',
        { targetAccountIds: [b._id.toString()], workspaceId: 'ws_1' } as any,
        'user_a'
      );

      const assigned = logged('TARGET_ASSIGNED');
      expect(assigned).toBeDefined();
      expect(assigned.meta.targetAccountIds).toEqual([b._id.toString()]);
      // status unchanged → no duplicate schedule event
      expect(logged('CONTENT_SCHEDULED')).toBeUndefined();
    });
  });
});
