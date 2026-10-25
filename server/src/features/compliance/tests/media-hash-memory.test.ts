import mongoose from 'mongoose';
import ComplianceCheckModel from '../compliance.model';
import CustomRuleModel from '../customRule.model';
import { ComplianceService } from '../compliance.service';

/**
 * Media copyright memory, URL-fingerprint mode (sharp not installed).
 * Path: a check that lands blocked stores its media hash; a later check with
 * the same media gets MEDIA_COPYRIGHT_VIOLATION regardless of content.
 */
describe('media hash memory (URL fingerprint)', () => {
  const service = new ComplianceService();
  const userId = 'test_media_hash_user';

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => mongoose.connection.once('open', resolve));
    }
  });

  afterAll(async () => {
    await ComplianceCheckModel.deleteMany({ userId } as any);
    await CustomRuleModel.deleteMany({ userId } as any);
  });

  it('remembers media from a blocked check and blocks re-use of the same media', async () => {
    await CustomRuleModel.create({
      userId,
      name: 'force-block',
      pattern: 'FORCEBLOCK',
      severity: 'error',
      action: 'block',
      enabled: true
    } as any);

    // First check: blocked by the keyword rule, media fingerprint stored.
    const first = await service.check(userId, {
      content: 'draft A with FORCEBLOCK keyword',
      platform: 'linkedin',
      media: [{ url: 'https://images.example.com/photo-1.jpg', kind: 'image' }]
    } as any);
    expect(first.status).toBe('blocked');

    // Second check: clean caption, SAME media — must trip media memory.
    const second = await service.check(userId, {
      content: 'A perfectly fine caption about engineering work today.',
      platform: 'linkedin',
      media: [{ url: 'https://images.example.com/photo-1.jpg', kind: 'image' }]
    } as any);
    const mediaFinding = (second as any).findings?.find((f: { code: string }) => f.code === 'MEDIA_COPYRIGHT_VIOLATION');
    expect(mediaFinding).toBeDefined();
    expect(second.status).toBe('blocked');

    // Different media on a clean caption stays clear of media findings.
    const third = await service.check(userId, {
      content: 'A perfectly fine caption about engineering work today.',
      platform: 'linkedin',
      media: [{ url: 'https://images.example.com/photo-2.jpg', kind: 'image' }]
    } as any);
    expect((third as any).findings?.find((f: { code: string }) => f.code === 'MEDIA_COPYRIGHT_VIOLATION')).toBeUndefined();
  });
});
