import crypto from 'crypto';
import { WorkspaceModel } from '../../features/workspace/workspace.model';
import { UserModel } from '../../features/user/user.model';

export interface ApiKeyIdentity {
  userId: string;
  email: string;
  workspaceId: string;
}

/**
 * Resolve a workspace API key to its owner.
 *
 * Keys are stored as a SHA-256 hash; the lookup uses the hash so the plaintext
 * never touches the database. Both auth middlewares share this helper so a key
 * works across the dashboard, workspace, social, and AI routes instead of only
 * the subset protected by the RBAC middleware.
 */
export async function resolveApiKey(apiKey: string): Promise<ApiKeyIdentity | null> {
  if (!apiKey.startsWith('sf_live_')) return null;

  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  const workspace = await WorkspaceModel.findOne({ apiKeyHash: keyHash })
    .select('_id ownerId')
    .lean();
  if (!workspace) return null;

  const owner = await UserModel.findById(workspace.ownerId).select('email').lean();
  if (!owner) return null;

  // Usage telemetry is best-effort and must never delay the request.
  WorkspaceModel.updateOne(
    { _id: workspace._id },
    { $set: { apiKeyLastUsedAt: new Date() } }
  ).catch(() => undefined);

  return {
    userId: workspace.ownerId,
    email: owner.email,
    workspaceId: workspace._id.toString()
  };
}
