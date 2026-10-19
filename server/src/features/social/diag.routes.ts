import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { authMiddleware } from '../../middleware/auth';
import { EncryptionAdapter } from '../../services/social/adapters/encryption.adapter';
import SocialAccountModel from './social.model';
import OAuthConnectionModel from './oauthConnection.model';

const router = Router();

/**
 * TRANSIENT diagnostic (safe-by-design): never returns token material. For one
 * social account it reports whether the stored ciphertexts decrypt with the
 * server's current ENCRYPTION_KEY, and shapes/lengths of the stored blobs so a
 * key/cipher mismatch can be proven from outside the database. Remove after
 * the investigation window.
 */
router.get('/social/:accountId', authMiddleware as unknown as (req: Request, res: Response) => void, (async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const { accountId } = req.params as any;
  if (!accountId || accountId.length > 64) {
    return res.status(400).json({ success: false, message: 'accountId required' });
  }
  try {
    const account = await SocialAccountModel.findOne({ _id: accountId, userId }).lean();
    if (!account) return res.status(404).json({ success: false, message: 'account not found' });

    const keyPrefix = crypto.createHash('sha256').update(String(process.env.ENCRYPTION_KEY || '')).digest().toString('hex').slice(0, 12);
    const probe = (ct?: string | null): { present: boolean; ok: boolean; len: number; ivLen: number; err: string } => {
      const out = { present: false, ok: false, len: 0, ivLen: -1, err: 'absent' };
      if (!ct) return out;
      const [iv, body] = String(ct).split(':');
      out.present = true;
      out.len = body ? body.length : 0;
      out.ivLen = iv ? iv.length / 2 : -1;
      try { EncryptionAdapter.decrypt(ct); out.ok = true; out.err = ''; } catch (e: any) { out.err = e.message; }
      return out;
    };

    let connectionInfo: Record<string, unknown> = { exists: false };
    try {
      const conn = account.connectionId ? await OAuthConnectionModel.findById(account.connectionId as any).lean() : null;
      if (conn) {
        connectionInfo = {
          exists: true,
          id: String((conn as any)._id),
          status: (conn as any).status,
          createdAt: (conn as any).createdAt,
          updatedAt: (conn as any).updatedAt,
          acc: probe((conn as any).encryptedAccessToken),
          ref: probe((conn as any).encryptedRefreshToken),
        };
      }
    } catch (e: any) {
      connectionInfo = { exists: false, note: 'lookup failed: ' + e.message };
    }

    return res.json({
      success: true,
      keyPrefix,
      algorithm: 'aes-256-cbc',
      account: {
        id: String((account as any)._id),
        platform: (account as any).platform,
        createdAt: (account as any).createdAt,
        updatedAt: (account as any).updatedAt,
        status: (account as any).status,
        connectionStatus: (account as any).connectionStatus,
        connectionId: (account as any).connectionId ? String((account as any).connectionId) : null,
        acc: probe((account as any).encryptedAccessToken),
        ref: probe((account as any).encryptedRefreshToken),
      },
      connection: connectionInfo,
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e.message });
  }
}) as unknown as (req: Request, res: Response) => void);

export default router;
