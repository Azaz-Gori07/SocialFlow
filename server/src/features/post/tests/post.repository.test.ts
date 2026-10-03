import mongoose from 'mongoose';
import { PostRepository } from '../post.repository';
import PostModel from '../post.model';
import { db } from '../../../database/db';

/**
 * Stale-lock recovery must only reclaim deliveries that never reached a terminal
 * state. Resetting a `published` delivery republishes content that already went
 * out; resurrecting a dead-lettered delivery retries a permanent failure.
 */
describe('PostRepository — stale-lock recovery and retry scoping', () => {
  let repo: PostRepository;
  const userId = 'usr_stale_1';

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 1) {
      await new Promise<void>((resolve) => mongoose.connection.once('open', () => resolve()));
    }
  });

  beforeEach(async () => {
    repo = new PostRepository();
    await db.posts.deleteMany({ userId } as any);
  });

  afterAll(async () => {
    await db.posts.deleteMany({ userId } as any);
  });

  const seedPost = async (deliveries: any[]) =>
    PostModel.create({
      userId,
      platforms: ['twitter'],
      content: 'x',
      media: [],
      status: 'publishing',
      lastAttemptAt: '2020-01-01T00:00:00.000Z',
      deliveries
    } as any);

  const delivery = (over: Partial<any> = {}) => ({
    socialAccountId: over.socialAccountId ?? 'acc_1',
    platform: 'twitter',
    status: 'publishing',
    idempotencyKey: over.idempotencyKey ?? 'k1',
    attempts: 0,
    maxAttempts: 5,
    deadLettered: false,
    ...over
  });

  it('leaves published deliveries untouched', async () => {
    const post = await seedPost([
      delivery({ socialAccountId: 'acc_pub', idempotencyKey: 'kpub', status: 'published' }),
      delivery({ socialAccountId: 'acc_stuck', idempotencyKey: 'kstuck', status: 'publishing' })
    ]);

    await repo.releaseStaleClaims('2099-01-01T00:00:00.000Z', '2099-01-02T00:00:00.000Z');

    const after = await PostModel.findById(post._id).exec();
    const byId = Object.fromEntries((after?.deliveries as any[]).map((d) => [d.socialAccountId, d]));

    expect(byId.acc_pub.status).toBe('published');
    expect(byId.acc_stuck.status).toBe('pending');
    expect(after?.status).toBe('scheduled');
  });

  it('does not resurrect dead-lettered deliveries', async () => {
    const post = await seedPost([
      delivery({ socialAccountId: 'acc_dead', idempotencyKey: 'kdead', status: 'failed', deadLettered: true })
    ]);

    await repo.releaseStaleClaims('2099-01-01T00:00:00.000Z', '2099-01-02T00:00:00.000Z');

    const after = await PostModel.findById(post._id).exec();
    expect((after?.deliveries as any[])[0].status).toBe('failed');
    expect((after?.deliveries as any[])[0].deadLettered).toBe(true);
  });

  it('never returns a dead-lettered post as retryable', async () => {
    await PostModel.create({
      userId,
      platforms: ['twitter'],
      content: 'x',
      media: [],
      status: 'failed',
      deliveries: [delivery({ socialAccountId: 'acc_dead2', idempotencyKey: 'kdead2', status: 'failed', deadLettered: true, nextRetryAt: '2000-01-01T00:00:00.000Z' })]
    } as any);

    const retryable = await repo.findRetryablePosts('2099-01-01T00:00:00.000Z');
    expect(retryable).toHaveLength(0);
  });

  it('does return a non-dead-lettered failed post as retryable', async () => {
    await PostModel.create({
      userId,
      platforms: ['twitter'],
      content: 'x',
      media: [],
      status: 'failed',
      deliveries: [delivery({ socialAccountId: 'acc_retry', idempotencyKey: 'kretry', status: 'failed', deadLettered: false, nextRetryAt: '2000-01-01T00:00:00.000Z' })]
    } as any);

    const retryable = await repo.findRetryablePosts('2099-01-01T00:00:00.000Z');
    expect(retryable).toHaveLength(1);
  });

  it('refuses to claim a dead-lettered delivery', async () => {
    const post = await seedPost([
      delivery({ socialAccountId: 'acc_dead3', idempotencyKey: 'kdead3', status: 'failed', deadLettered: true })
    ]);

    const claimed = await repo.claimDelivery(post._id.toString(), 'acc_dead3', '2099-01-02T00:00:00.000Z');
    expect(claimed).toBeNull();
  });

  it('still claims a normal pending delivery', async () => {
    const post = await seedPost([
      delivery({ socialAccountId: 'acc_ok', idempotencyKey: 'kok', status: 'pending' })
    ]);

    const claimed = await repo.claimDelivery(post._id.toString(), 'acc_ok', '2099-01-02T00:00:00.000Z');
    expect(claimed).not.toBeNull();
    expect((claimed?.deliveries as any[])[0].status).toBe('publishing');
  });

  it('derives failed when a post somehow has no deliveries', () => {
    expect(repo.deriveStatus([])).toBe('failed');
  });

  // Regression: a partial update must not write the schema default `status:
  // 'draft'` over an existing scheduled post, which silently removed it from
  // the publishing scheduler.
  describe('partial updates never clobber status', () => {
    const seedScheduled = async () => {
      const post = await seedPost([delivery({ socialAccountId: 'acc_s', idempotencyKey: 'ks' })]);
      await PostModel.updateOne(
        { _id: post._id },
        { $set: { status: 'scheduled', scheduledAt: '2030-01-01T00:00:00.000Z' } } as any
      );
      return PostModel.findById(post._id).exec();
    };

    it('keeps status when only the schedule time is updated', async () => {
      const post = await seedScheduled();

      const updated = await repo.updatePost(post!._id.toString(), {
        scheduledAt: '2030-02-01T00:00:00.000Z',
      } as any);

      expect(updated?.status).toBe('scheduled');
      expect(updated?.scheduledAt).toBe('2030-02-01T00:00:00.000Z');
    });

    it('keeps status when only the content is updated', async () => {
      const post = await seedScheduled();

      const updated = await repo.updatePost(post!._id.toString(), { content: 'edited' } as any);

      expect(updated?.status).toBe('scheduled');
      expect(updated?.content).toBe('edited');
    });

    it('does not resurrect deliveries that were already published', async () => {
      const post = await PostModel.create({
        userId,
        platforms: ['twitter'],
        content: 'x',
        media: [],
        status: 'published',
        deliveries: [delivery({ socialAccountId: 'acc_p', idempotencyKey: 'kp', status: 'published' })]
      } as any);

      await repo.updatePost(post._id.toString(), { content: 'edited again' } as any);

      const after = await PostModel.findById(post._id).exec();
      expect(after?.status).toBe('published');
      expect((after?.deliveries as any[])[0].status).toBe('published');
    });

    it('returns the untouched document when nothing was supplied', async () => {
      const post = await seedScheduled();
      const same = await repo.updatePost(post!._id.toString(), {} as any);
      expect(same?.status).toBe('scheduled');
    });
  });
});