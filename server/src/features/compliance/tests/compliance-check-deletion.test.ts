import mongoose from 'mongoose';
import ComplianceCheckModel from '../compliance.model';
import { ComplianceService } from '../compliance.service';

describe('compliance check state after provider deletion', () => {
  const service = new ComplianceService();

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => mongoose.connection.once('open', resolve));
    }
  });

  afterAll(async () => {
    await ComplianceCheckModel.deleteMany({ userId: 'test_compliance_delete_user' });
  });

  it('flips a published record to removed when the post is deleted from the provider', async () => {
    const urn = 'urn:li:share:test-delete-1';
    await ComplianceCheckModel.create({
      userId: 'test_compliance_delete_user',
      contentHash: 'hash-test-delete-1',
      platform: 'linkedin',
      policyVersion: 'test-v1',
      status: 'published',
      externalPostId: urn,
      findings: []
    } as any);

    await service.markRemovedByExternalId(urn);

    const row = await ComplianceCheckModel.findOne({ externalPostId: urn } as any).exec();
    expect(row).not.toBeNull();
    expect(row!.status).toBe('removed');
    expect(row!.removedAt).toBeDefined();
  });

  it('leaves records for other posts untouched', async () => {
    const urn = 'urn:li:share:test-keep-1';
    await ComplianceCheckModel.create({
      userId: 'test_compliance_delete_user',
      contentHash: 'hash-test-keep-1',
      platform: 'linkedin',
      policyVersion: 'test-v1',
      status: 'published',
      externalPostId: urn,
      findings: []
    } as any);

    await service.markRemovedByExternalId('urn:li:share:test-delete-other');

    const row = await ComplianceCheckModel.findOne({ externalPostId: urn } as any).exec();
    expect(row!.status).toBe('published');
  });
});
