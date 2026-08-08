import { ISocialAccount } from './social.model';
import { IOAuthConnection } from './oauthConnection.model';

/** Safe account shape for API responses (guideline §21: no tokens, no client secrets). */
export function toSafeAccount(doc: ISocialAccount | null | undefined) {
  if (!doc) return null;
  return {
    _id: doc._id.toString(),
    userId: doc.userId,
    workspaceId: doc.workspaceId ?? null,
    platform: doc.platform,
    accountType: doc.accountType,
    providerAccountId: doc.providerAccountId,
    providerParentAccountId: doc.providerParentAccountId ?? null,
    username: doc.username,
    displayName: doc.displayName,
    avatarUrl: doc.avatarUrl ?? null,
    capabilities: doc.capabilities,
    providerCapabilities: doc.providerCapabilities,
    status: doc.status,
    connectionStatus: doc.connectionStatus,
    lastValidatedAt: doc.lastValidatedAt ?? null,
    lastSyncedAt: doc.lastSyncedAt ?? null,
    lastError: doc.lastError ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function toSafeAccountList(docs: ISocialAccount[]) {
  return docs.map(toSafeAccount);
}

/** Safe connection shape for API responses. */
export function toSafeConnection(doc: IOAuthConnection | null | undefined) {
  if (!doc) return null;
  return {
    _id: doc._id.toString(),
    userId: doc.userId,
    platform: doc.platform,
    provider: doc.provider,
    externalAccountId: doc.externalAccountId,
    status: doc.status,
    scopes: doc.scopes,
    lastValidatedAt: doc.lastValidatedAt ?? null,
    lastError: doc.lastError ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
