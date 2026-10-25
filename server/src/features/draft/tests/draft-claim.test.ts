import mongoose from 'mongoose';
import DraftModel from '../draft.model';
import { DraftRepository } from '../draft.repository';

describe('atomic draft claiming (double-delivery fix)', () => {
  const repo = new DraftRepository();

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => mongoose.connection.once('open', resolve));
    }
  });

  afterAll(async () => {
    await DraftModel.deleteMany({ userId: 'test_claim_user' } as any);
  });

  it('claims a ready draft exactly once; the second claimer gets null', async () => {
    const created = await DraftModel.create({
      userId: 'test_claim_user',
      platform: 'linkedin',
      contentType: 'post',
      caption: 'claim race test',
      status: 'ready'
    } as any);

    const first = await repo.claimForPublishing(created._id.toString());
    expect(first).not.toBeNull();
    expect(first!.status).toBe('publishing');

    const second = await repo.claimForPublishing(created._id.toString());
    expect(second).toBeNull();
  });

  it('never claims a draft that is not ready', async () => {
    const created = await DraftModel.create({
      userId: 'test_claim_user',
      platform: 'linkedin',
      contentType: 'post',
      caption: 'not ready',
      status: 'draft'
    } as any);
    expect(await repo.claimForPublishing(created._id.toString())).toBeNull();
  });
});
