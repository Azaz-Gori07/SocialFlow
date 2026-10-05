import mongoose from 'mongoose';
import { AppError } from '../../../shared/errors/appError';
import { resolveTargetAccounts, FANOUT_CONFIRM_THRESHOLD } from '../targeting';
import { SocialAccountModel } from '../social.model';
import { toSafeAccount } from '../social.sanitizer';

/**
 * Account-level targeting: server-side validation of targetAccountIds.
 * Covers invalid / foreign / cross-workspace / cross-platform / unusable
 * targets, the empty-selection rule, the fan-out confirmation gate, and the
 * legacy fan-out path.
 */

const oid = () => new mongoose.Types.ObjectId().toString();

const makeAccount = (over: Record<string, any> = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  userId: 'user_a',
  platform: 'twitter',
  username: 'handle',
  displayName: 'Handle',
  status: 'active',
  connectionStatus: 'connected',
  workspaceId: undefined,
  ...over
});

async function rejected(p: Promise<any>): Promise<AppError> {
  try {
    await p;
  } catch (err: any) {
    return err;
  }
  throw new Error('expected the promise to reject');
}

describe('resolveTargetAccounts', () => {
  let deps: any;
  let pool: any[];

  beforeEach(() => {
    pool = [];
    deps = {
      socialRepository: {
        findAccountsByUserId: jest.fn(async (userId: string) => pool.filter((a) => a.userId === userId)),
        findAccountsByIds: jest.fn(async (userId: string, ids: string[]) =>
          pool.filter((a) => a.userId === userId && ids.includes(a._id.toString()))
        )
      },
      workspaceRepository: {
        findMember: jest.fn(async () => ({ userId: 'user_a' }))
      }
    };
  });

  describe('legacy path (targetAccountIds absent)', () => {
    it('fans out to every connected account of the requested platforms', async () => {
      const a = makeAccount({ username: 'a' });
      const b = makeAccount({ username: 'b' });
      const other = makeAccount({ username: 'ig', platform: 'instagram' });
      const foreign = makeAccount({ username: 'foreign', userId: 'user_b' });
      pool.push(a, b, other, foreign);

      const result = await resolveTargetAccounts({ userId: 'user_a', platforms: ['twitter'] }, deps);

      expect(result.explicit).toBe(false);
      expect(result.accounts.map((x) => x.username).sort()).toEqual(['a', 'b']);
      expect(deps.socialRepository.findAccountsByIds).not.toHaveBeenCalled();
    });
  });

  describe('explicit targeting', () => {
    it('resolves exactly the selected accounts', async () => {
      const a = makeAccount({ username: 'a' });
      const b = makeAccount({ username: 'b' });
      pool.push(a, b);

      const result = await resolveTargetAccounts(
        { userId: 'user_a', platforms: ['twitter'], targetAccountIds: [a._id.toString()], workspaceId: 'ws_1' },
        deps
      );

      expect(result.explicit).toBe(true);
      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0].username).toBe('a');
      expect(deps.socialRepository.findAccountsByIds).toHaveBeenCalledWith('user_a', [a._id.toString()]);
    });

    it('rejects an empty selection — never "publish everywhere"', async () => {
      const err = await rejected(
        resolveTargetAccounts(
          { userId: 'user_a', platforms: ['twitter'], targetAccountIds: [], workspaceId: 'ws_1' },
          deps
        )
      );
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('Select at least one target account');
    });

    it('rejects malformed account ids before touching the database', async () => {
      const err = await rejected(
        resolveTargetAccounts(
          { userId: 'user_a', platforms: ['twitter'], targetAccountIds: ['not-an-objectid'], workspaceId: 'ws_1' },
          deps
        )
      );
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('invalid');
      expect(deps.socialRepository.findAccountsByIds).not.toHaveBeenCalled();
    });

    it('rejects another user\'s account id (foreign target)', async () => {
      pool.push(makeAccount({ userId: 'user_b' }));
      const foreignId = pool[0]._id.toString();

      const err = await rejected(
        resolveTargetAccounts(
          { userId: 'user_a', platforms: ['twitter'], targetAccountIds: [foreignId], workspaceId: 'ws_1' },
          deps
        )
      );
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('invalid or unavailable');
    });

    it('requires the active workspace for explicit targeting', async () => {
      pool.push(makeAccount());
      const err = await rejected(
        resolveTargetAccounts(
          { userId: 'user_a', platforms: ['twitter'], targetAccountIds: [pool[0]._id.toString()] },
          deps
        )
      );
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('workspaceId is required');
    });

    it('rejects a workspace the user is not a member of', async () => {
      pool.push(makeAccount());
      deps.workspaceRepository.findMember.mockResolvedValue(null);

      const err = await rejected(
        resolveTargetAccounts(
          { userId: 'user_a', platforms: ['twitter'], targetAccountIds: [pool[0]._id.toString()], workspaceId: 'ws_1' },
          deps
        )
      );
      expect(err.statusCode).toBe(403);
      expect(err.message).toContain('workspace');
    });

    it('rejects an account bound to a different workspace', async () => {
      pool.push(makeAccount({ workspaceId: 'ws_other' }));

      const err = await rejected(
        resolveTargetAccounts(
          { userId: 'user_a', platforms: ['twitter'], targetAccountIds: [pool[0]._id.toString()], workspaceId: 'ws_1' },
          deps
        )
      );
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('does not belong to this workspace');
    });

    it('rejects a wrong-platform target', async () => {
      pool.push(makeAccount({ platform: 'linkedin', username: 'company' }));

      const err = await rejected(
        resolveTargetAccounts(
          { userId: 'user_a', platforms: ['twitter'], targetAccountIds: [pool[0]._id.toString()], workspaceId: 'ws_1' },
          deps
        )
      );
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('linkedin account');
    });

    it('rejects an account that is not connected/usable', async () => {
      pool.push(makeAccount({ connectionStatus: 'expired' }));

      const err = await rejected(
        resolveTargetAccounts(
          { userId: 'user_a', platforms: ['twitter'], targetAccountIds: [pool[0]._id.toString()], workspaceId: 'ws_1' },
          deps
        )
      );
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('not usable for publishing');
    });

    it('rejects a disconnected (non-active) account', async () => {
      pool.push(makeAccount({ status: 'disconnected' }));

      const err = await rejected(
        resolveTargetAccounts(
          { userId: 'user_a', platforms: ['twitter'], targetAccountIds: [pool[0]._id.toString()], workspaceId: 'ws_1' },
          deps
        )
      );
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('not usable for publishing');
    });

    it('deduplicates repeated ids', async () => {
      const a = makeAccount();
      pool.push(a);
      const id = a._id.toString();

      const result = await resolveTargetAccounts(
        { userId: 'user_a', platforms: ['twitter'], targetAccountIds: [id, id], workspaceId: 'ws_1' },
        deps
      );
      expect(result.accounts).toHaveLength(1);
    });

    it('allows multi-platform selections as long as each account matches', async () => {
      const tw = makeAccount({ platform: 'twitter' });
      const li = makeAccount({ platform: 'linkedin' });
      pool.push(tw, li);

      const result = await resolveTargetAccounts(
        {
          userId: 'user_a',
          platforms: ['twitter', 'linkedin'],
          targetAccountIds: [tw._id.toString(), li._id.toString()],
          workspaceId: 'ws_1'
        },
        deps
      );
      expect(result.accounts).toHaveLength(2);
    });
  });

  describe('publishDefault preference', () => {
    it('defaults to false — defaults are opt-in, never implicit', () => {
      const doc = new SocialAccountModel({
        userId: 'user_a',
        platform: 'twitter',
        providerAccountId: 'pa_1',
        username: 'handle',
        displayName: 'Handle'
      });
      expect(doc.publishDefault).toBe(false);
    });

    it('is exposed to the client (and tokens still are not)', () => {
      const doc = new SocialAccountModel({
        userId: 'user_a',
        platform: 'twitter',
        providerAccountId: 'pa_1',
        username: 'handle',
        displayName: 'Handle',
        publishDefault: true,
        encryptedAccessToken: 'secret-token'
      });
      const safe = toSafeAccount(doc) as any;
      expect(safe.publishDefault).toBe(true);
      expect(safe.encryptedAccessToken).toBeUndefined();
    });
  });

  describe('fan-out confirmation gate', () => {
    it('rejects a >= threshold selection without confirmation', async () => {
      const ids: string[] = [];
      for (let i = 0; i < FANOUT_CONFIRM_THRESHOLD; i++) {
        const acc = makeAccount({ username: `u${i}` });
        pool.push(acc);
        ids.push(acc._id.toString());
      }

      const err = await rejected(
        resolveTargetAccounts(
          { userId: 'user_a', platforms: ['twitter'], targetAccountIds: ids, workspaceId: 'ws_1' },
          deps
        )
      );
      expect(err.statusCode).toBe(400);
      expect(err.message).toBe(
        `You're about to publish this post to ${FANOUT_CONFIRM_THRESHOLD} accounts. Confirm the fan-out to continue.`
      );
    });

    it('accepts a >= threshold selection once confirmed', async () => {
      const ids: string[] = [];
      for (let i = 0; i < FANOUT_CONFIRM_THRESHOLD; i++) {
        const acc = makeAccount({ username: `u${i}` });
        pool.push(acc);
        ids.push(acc._id.toString());
      }

      const result = await resolveTargetAccounts(
        {
          userId: 'user_a',
          platforms: ['twitter'],
          targetAccountIds: ids,
          workspaceId: 'ws_1',
          fanoutConfirmed: true
        },
        deps
      );
      expect(result.accounts).toHaveLength(FANOUT_CONFIRM_THRESHOLD);
    });

    it('does not gate selections below the threshold', async () => {
      const ids: string[] = [];
      for (let i = 0; i < FANOUT_CONFIRM_THRESHOLD - 1; i++) {
        const acc = makeAccount({ username: `u${i}` });
        pool.push(acc);
        ids.push(acc._id.toString());
      }

      const result = await resolveTargetAccounts(
        { userId: 'user_a', platforms: ['twitter'], targetAccountIds: ids, workspaceId: 'ws_1' },
        deps
      );
      expect(result.accounts).toHaveLength(FANOUT_CONFIRM_THRESHOLD - 1);
    });
  });
});
