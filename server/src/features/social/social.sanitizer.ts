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
    publishDefault: doc.publishDefault ?? false,
    autoPostEnabled: doc.autoPostEnabled ?? false,
    lastValidatedAt: doc.lastValidatedAt ?? null,
    lastSyncedAt: doc.lastSyncedAt ?? null,
    lastError: doc.lastError ?? null,
    /**
     * Unofficial X session marker. Only the presence/state is exposed — the
     * encrypted cookies themselves never leave the server.
     */
    xSession: {
      connected: Boolean(doc.xSessionAuthTokenEncrypted && doc.xSessionCt0Encrypted),
      method: doc.xSessionMethod ?? null,
      connectedAt: doc.xSessionConnectedAt ?? null,
      lastUsedAt: doc.xSessionLastUsedAt ?? null,
      lastError: doc.xSessionLastError ?? null,
    },
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
