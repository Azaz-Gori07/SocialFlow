import mongoose from 'mongoose';
import { DraftService } from '../draft.service';
import { DraftRepository } from '../draft.repository';
import { logActivity } from '../../../shared/utils/activityLog';
import { resolveTargetAccounts } from '../../social/targeting';
import { db } from '../../../database/db';

/**
 * P3: TARGET_ASSIGNED audit when drafts are (re)targeted — plus the write-time
 * validation hook on draft create.
 */

jest.mock('../draft.repository');
jest.mock('../../social/targeting');
jest.mock('../../../shared/utils/activityLog');
jest.mock('../../../database/db', () => ({
  db: {
    workspaces: { findById: jest.fn() },
    workspaceMembers: { findOne: jest.fn() }
  }
}));

describe('DraftService — target audit', () => {
  const WS_ID = new mongoose.Types.ObjectId().toString();
  let service: DraftService;
  let mockDraftRepository: jest.Mocked<DraftRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    (db.workspaces.findById as jest.Mock).mockReturnValue({
      select: () => ({ lean: async () => ({ ownerId: 'user_a' }) })
    });
    (db.workspaceMembers.findOne as jest.Mock).mockReturnValue({
      lean: async () => null
    });
    mockDraftRepository = new DraftRepository() as jest.Mocked<DraftRepository>;
    (resolveTargetAccounts as jest.Mock).mockResolvedValue({ accounts: [], explicit: true });
    const created: any = { _id: new mongoose.Types.ObjectId(), platform: 'twitter', userId: 'user_a' };
    mockDraftRepository.create.mockResolvedValue(created);
    mockDraftRepository.findById.mockResolvedValue(created);
    mockDraftRepository.update.mockResolvedValue({ ...created, targetAccountIds: ['aaaaaaaaaaaaaaaaaaaaaaaa'] });
    service = new DraftService(mockDraftRepository);
  });

  it('logs TARGET_ASSIGNED when a draft is created with explicit targets', async () => {
    await service.createDraft(
      {
        platform: 'twitter',
        contentType: 'post',
        caption: 'x',
        media: [],
        targetAccountIds: ['aaaaaaaaaaaaaaaaaaaaaaaa'],
        workspaceId: WS_ID
      } as any,
      'user_a'
    );

    expect(resolveTargetAccounts).toHaveBeenCalled();
    expect(logActivity).toHaveBeenCalledTimes(1);
    const event = (logActivity as jest.Mock).mock.calls[0][0];
    expect(event.action).toBe('TARGET_ASSIGNED');
    expect(event.meta.draftId).toBeDefined();
    expect(event.meta.platforms).toEqual(['twitter']);
    expect(event.meta.targetAccountIds).toEqual(['aaaaaaaaaaaaaaaaaaaaaaaa']);
    expect(event.meta.actor).toBe('user_a');
    expect(event.meta.workspaceId).toBe(WS_ID);
    expect(event.meta.source).toBe('manual');
  });

  it('rejects a workspace the caller neither owns nor belongs to', async () => {
    (db.workspaces.findById as jest.Mock).mockReturnValue({
      select: () => ({ lean: async () => ({ ownerId: 'someone_else' }) })
    });
    (db.workspaceMembers.findOne as jest.Mock).mockReturnValue({
      lean: async () => null
    });

    await expect(
      service.createDraft(
        {
          platform: 'twitter',
          contentType: 'post',
          caption: 'x',
          media: [],
          workspaceId: WS_ID
        } as any,
        'user_a'
      )
    ).rejects.toThrow('You do not have access to this workspace');
    expect(mockDraftRepository.create).not.toHaveBeenCalled();
  });

  it('does not log for legacy drafts without targeting', async () => {
    await service.createDraft(
      { platform: 'twitter', contentType: 'post', caption: 'x', media: [] } as any,
      'user_a'
    );
    expect(resolveTargetAccounts).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });

  it('logs TARGET_ASSIGNED when an edit changes the target set', async () => {
    mockDraftRepository.findById.mockResolvedValue({
      _id: new mongoose.Types.ObjectId(),
      platform: 'twitter',
      userId: 'user_a',
      status: 'draft',
      targetAccountIds: ['bbbbbbbbbbbbbbbbbbbbbbbb']
    } as any);

    await service.editDraft(
      'd1',
      { targetAccountIds: ['aaaaaaaaaaaaaaaaaaaaaaaa'], workspaceId: WS_ID } as any,
      'user_a'
    );

    expect(logActivity).toHaveBeenCalledTimes(1);
    const event = (logActivity as jest.Mock).mock.calls[0][0];
    expect(event.action).toBe('TARGET_ASSIGNED');
    expect(event.meta.targetAccountIds).toEqual(['aaaaaaaaaaaaaaaaaaaaaaaa']);
  });

  it('does not log when the target set is unchanged', async () => {
    mockDraftRepository.findById.mockResolvedValue({
      _id: new mongoose.Types.ObjectId(),
      platform: 'twitter',
      userId: 'user_a',
      status: 'draft',
      targetAccountIds: ['aaaaaaaaaaaaaaaaaaaaaaaa']
    } as any);

    await service.editDraft(
      'd1',
      { targetAccountIds: ['aaaaaaaaaaaaaaaaaaaaaaaa'], workspaceId: WS_ID } as any,
      'user_a'
    );

    expect(logActivity).not.toHaveBeenCalled();
  });
});
