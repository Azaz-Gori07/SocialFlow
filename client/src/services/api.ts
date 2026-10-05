const API_BASE = import.meta.env.VITE_BACKEND_API_URL?.replace(/\/$/, '');

import { isTokenExpiring, refreshAccessToken, hardLogout } from './token';

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

// Human-readable fallbacks when the server sends no message.
const STATUS_MESSAGES: Record<number, string> = {
  400: 'Invalid request. Please check the fields and try again.',
  401: 'Your session has expired or credentials are invalid. Please log in again.',
  403: 'You do not have permission to perform this action.',
  404: 'We could not find what you were looking for.',
  409: 'This conflicts with existing data. It may already exist.',
  413: 'The input is too large.',
  422: 'Some of the provided data is invalid.',
  429: 'Too many requests. Please wait a moment and try again.',
  500: 'Server error. Please try again later.',
  502: 'Server error. Please try again later.',
  503: 'Service temporarily unavailable. Please try again later.',
  504: 'Request timed out. Please try again later.'
};

// Global API helper
async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers || {});

  if (!options.skipAuth) {
    // Proactive: access tokens live 15 minutes. If the stored one is expired
    // (or about to be), rotate it BEFORE the first byte goes out — this is
    // what keeps /auth/me and friends from ever logging a 401 on page load.
    // Single-flight: concurrent first-paint requests share one refresh call.
    if (isTokenExpiring(localStorage.getItem('access_token'))) {
      const refreshed = await refreshAccessToken();
      if (refreshed.status === 'unauthorized' || refreshed.status === 'none') {
        // Rejected, or nothing left to renew with (e.g. logout already
        // cleared storage mid-stampede) — end the session instead of firing
        // headerless requests that each 401.
        hardLogout();
        throw new Error('Your session has expired. Please sign in again.');
      }
      // 'ok' → proceed with the rotated token; 'network' → the request below
      // will surface its own (network) failure without burning the session.
    }

    const token = localStorage.getItem('access_token');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const config: RequestInit = {
    ...options,
    headers
  };

  let response = await fetch(`${API_BASE}${endpoint}`, config);

  // Reactive retry: server rejected the token we sent (revoked, or expired
  // mid-flight). Rotate once via the shared single-flight refresh, retry.
  if (response.status === 401 && !options.skipAuth) {
    const refreshed = await refreshAccessToken();
    if (refreshed.status === 'ok') {
      headers.set('Authorization', `Bearer ${refreshed.token}`);
      response = await fetch(`${API_BASE}${endpoint}`, { ...config, headers });
    } else if (refreshed.status === 'unauthorized') {
      hardLogout();
    } else if (refreshed.status === 'none') {
      // No refresh token at all — leave the 401 for the caller to handle.
    }
    // 'network': leave the original response; caller sees the real failure.
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || STATUS_MESSAGES[response.status] || `Request failed (${response.status}). Please try again.`);
  }

  const json = await response.json() as any;
  
  // Unwrap standard API envelope: { success, data, message, errors, timestamp }
  // If response has a `data` field, return data. Otherwise return the whole response.
  if (json && typeof json === 'object' && 'data' in json && 'success' in json) {
    return json.data as T;
  }
  
  return json as T;
}

/** Shared cache for the connected-accounts list (many surfaces ask for it). */
const ACCOUNTS_TTL_MS = 30_000;
let accountsCache: { at: number; data: any[] } | null = null;
let accountsInflight: Promise<any[]> | null = null;

export const api = {
  auth: {
    register: (body: any) => request<any>('/auth/register', { method: 'POST', body: JSON.stringify(body), skipAuth: true }),
    login: (body: any) => request<any>('/auth/login', { method: 'POST', body: JSON.stringify(body), skipAuth: true }),
    verifyOtp: (body: any) => request<any>('/auth/verify-otp', { method: 'POST', body: JSON.stringify(body), skipAuth: true }),
    forgotPassword: (email: string) => request<any>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }), skipAuth: true }),
    resetPassword: (userId: string, code: string, newPassword: string) =>
      request<any>('/auth/reset-password', { method: 'POST', body: JSON.stringify({ userId, code, newPassword }), skipAuth: true }),
    exchange: (code: string) => request<any>('/auth/exchange', { method: 'POST', body: JSON.stringify({ code }), skipAuth: true }),
    logout: () => request<any>('/auth/logout', { method: 'POST', skipAuth: true }),
    me: () => request<any>('/auth/me')
  },
  
  social: {
    // 30s cache: pickers/pages reopen constantly; the server re-validates
    // every target id anyway, so a briefly stale list can never publish wrong.
    getAccounts: async (opts?: { force?: boolean }) => {
      if (!opts?.force && accountsCache && Date.now() - accountsCache.at < ACCOUNTS_TTL_MS) {
        return accountsCache.data;
      }
      // Concurrent callers (StrictMode double-mount, picker + page at once)
      // share one request instead of racing.
      if (!opts?.force && accountsInflight) return accountsInflight;
      accountsInflight = request<any[]>('/social/accounts')
        .then(data => {
          accountsCache = { at: Date.now(), data };
          return data;
        })
        .finally(() => { accountsInflight = null; });
      return accountsInflight;
    },
    invalidateAccounts: () => { accountsCache = null; },
    disconnect: async (id: string) => {
      const res = await request<any>(`/social/accounts/${id}`, { method: 'DELETE' });
      accountsCache = null;
      return res;
    },
    updateAccount: async (id: string, body: { publishDefault: boolean }) => {
      const res = await request<any>(`/social/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      // Keep the cache coherent without a refetch.
      if (accountsCache) {
        accountsCache.data = accountsCache.data.map(a => (a._id === id ? { ...a, ...body } : a));
      }
      return res;
    },
    connectOAuth: (platform: string) => request<{ url: string }>(`/social/connect/${platform}`, { method: 'POST' })
  },
  
  dashboard: {
    getOverview: () => request<any>('/dashboard/overview'),
    getGrowth: () => request<any[]>('/dashboard/growth'),
    getPlatforms: () => request<any[]>('/dashboard/platforms')
  },
  
  posts: {
    list: async (status?: string) => {
      const result = await request<any>(`/posts/list${status ? `?status=${status}` : ''}`);
      return Array.isArray(result) ? result : (result?.items ?? []);
    },
    get: (id: string) => request<any>(`/posts/${id}`),
    create: (body: any) => request<any>('/posts', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: any) => request<any>(`/posts/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: string) => request<any>(`/posts/${id}`, { method: 'DELETE' }),
    bulkSchedule: (posts: any[], workspaceId?: string) => request<any>('/posts/schedule', { method: 'POST', body: JSON.stringify({ posts, workspaceId }) })
  },
  
  comments: {
    // The comments API is workspace-scoped: every endpoint requires workspaceId.
    list: (workspaceId: string, platform?: string, status?: string) => {
      const params = new URLSearchParams();
      params.append('workspaceId', workspaceId);
      if (platform) params.append('platform', platform);
      if (status) params.append('status', status);
      return request<any[]>(`/comments?${params.toString()}`);
    },
    reply: (workspaceId: string, commentId: string, message: string) =>
      request<any>('/comments/reply', { method: 'POST', body: JSON.stringify({ workspaceId, commentId, message }) }),
    resolve: (workspaceId: string, id: string, status: 'resolved' | 'unresolved') =>
      request<any>(`/comments/resolve/${id}`, { method: 'PUT', body: JSON.stringify({ workspaceId, status }) }),
    assign: (workspaceId: string, id: string, assignedTo: string) =>
      request<any>(`/comments/assign/${id}`, { method: 'PUT', body: JSON.stringify({ workspaceId, assignedTo }) })
  },
  
  workspaces: {
    create: (name: string) => request<any>('/workspace', { method: 'POST', body: JSON.stringify({ name }) }),
    list: () => request<any[]>('/workspace/list'),
    invite: (workspaceId: string, email: string, role: string) => request<any>('/workspace/invite', { method: 'POST', body: JSON.stringify({ workspaceId, email, role }) }),
    updateRole: (workspaceId: string, memberUserId: string, role: string) => request<any>('/workspace/role', { method: 'PUT', body: JSON.stringify({ workspaceId, memberUserId, role }) }),
    removeMember: (workspaceId: string, memberUserId: string) => request<any>(`/workspace/${workspaceId}/member`, { method: 'DELETE', body: JSON.stringify({ memberUserId }) }),
    members: (workspaceId: string) => request<any[]>(`/workspace/${workspaceId}/members`)
  },
  
  ai: {
    generatePost: (prompt: string) => request<any>('/ai/generate-post', { method: 'POST', body: JSON.stringify({ prompt }) }),
    regenerate: (prompt: string, platform: string) => request<any>('/ai/regenerate', { method: 'POST', body: JSON.stringify({ prompt, platform }) }),
    suggestReply: (commentId: string) => request<any>('/ai/reply-suggestion', { method: 'POST', body: JSON.stringify({ commentId }) }),
    repurposeYoutube: (url: string) => request<any>('/repurpose/youtube', { method: 'POST', body: JSON.stringify({ url }) }),
    repurposeBlog: (url: string) => request<any>('/repurpose/blog', { method: 'POST', body: JSON.stringify({ url }) }),
    getInsights: () => request<any[]>('/insights'),
    generateInsights: () => request<any[]>('/insights/generate', { method: 'POST' })
  },
  
  notifications: {
    list: () => request<any[]>('/notifications'),
    getUnreadCount: () => request<{ count: number }>('/notifications/unread-count'),
    markRead: (id: string) => request<any>(`/notifications/${id}/read`, { method: 'PUT' }),
    markAllRead: () => request<any>('/notifications/read-all', { method: 'PUT' }),
    delete: (id: string) => request<any>(`/notifications/${id}`, { method: 'DELETE' }),
    getPreferences: () => request<any>('/notifications/preferences'),
    updatePreferences: (body: any) => request<any>('/notifications/preferences', { method: 'PUT', body: JSON.stringify(body) })
  },
  
  // Developer Intelligence. Response shapes mirror server/src/features/developer
  // exactly: list endpoints return {items,total}, memory returns {items,grouped,total,limit,offset}.
  developer: {
    status: () => request<{ enabled: boolean }>('/developer/status'),
    overview: () => request<any>('/developer/overview'),

    getGithubAuthUrl: () => request<{ url: string }>('/developer/github/auth-url'),
    completeGithubAuth: (code: string, state: string) =>
      request<any>('/developer/github/callback', { method: 'POST', body: JSON.stringify({ code, state }) }),
    getGithubConnection: () => request<any>('/developer/github/connection'),
    disconnectGithub: () => request<{ disconnected: boolean }>('/developer/github/connection', { method: 'DELETE' }),

    listRepositories: () => request<any>('/developer/repositories'),
    listAvailableRepositories: () => request<any>('/developer/repositories/available'),
    mirrorRepositories: () => request<{ mirrored: number; total: number }>('/developer/repositories/sync', { method: 'POST' }),
    getRepository: (id: string) => request<any>(`/developer/repositories/${id}`),
    setRepositoryMonitoring: (id: string, enabled: boolean) =>
      request<any>(`/developer/repositories/${id}/monitoring`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
    deleteRepository: (id: string) => request<any>(`/developer/repositories/${id}`, { method: 'DELETE' }),
    syncRepository: (id: string) => request<any>(`/developer/repositories/${id}/sync`, { method: 'POST' }),

    // repositoryId is required by the server's zod query schema, not optional.
    listSyncLogs: (repositoryId: string, limit = 10) =>
      request<any>(`/developer/sync-logs?repositoryId=${encodeURIComponent(repositoryId)}&limit=${limit}`),

    listActivities: (params: { repositoryId?: string; importance?: string; limit?: number; offset?: number }) => {
      const q = new URLSearchParams();
      if (params.repositoryId) q.append('repositoryId', params.repositoryId);
      if (params.importance) q.append('importance', params.importance);
      q.append('limit', String(params.limit ?? 20));
      q.append('offset', String(params.offset ?? 0));
      return request<any>(`/developer/activities?${q.toString()}`);
    },
    getActivity: (id: string) => request<any>(`/developer/activities/${id}`),

    listMemory: (params: { repositoryId: string; category?: string; search?: string; limit?: number; offset?: number }) => {
      const q = new URLSearchParams({ repositoryId: params.repositoryId });
      if (params.category) q.append('category', params.category);
      // min(1) on the server: an empty search term is a 400, so only send a real one.
      if (params.search) q.append('search', params.search);
      q.append('limit', String(params.limit ?? 50));
      q.append('offset', String(params.offset ?? 0));
      return request<any>(`/developer/memory?${q.toString()}`);
    },
    updateMemory: (id: string, body: { value?: string; items?: string[]; category?: string }) =>
      request<any>(`/developer/memory/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    archiveMemory: (id: string) => request<{ archived: boolean }>(`/developer/memory/${id}/archive`, { method: 'POST' }),
    restoreMemory: (id: string) => request<{ restored: boolean }>(`/developer/memory/${id}/restore`, { method: 'POST' }),

    listOpportunities: (params: { status?: string; repositoryId?: string; limit?: number; offset?: number }) => {
      const q = new URLSearchParams();
      if (params.status) q.append('status', params.status);
      if (params.repositoryId) q.append('repositoryId', params.repositoryId);
      q.append('limit', String(params.limit ?? 20));
      q.append('offset', String(params.offset ?? 0));
      return request<any>(`/developer/opportunities?${q.toString()}`);
    },
    setOpportunityStatus: (id: string, status: string) =>
      request<any>(`/developer/opportunities/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
    generateOpportunity: (id: string) =>
      request<any>(`/developer/opportunities/${id}/generate`, { method: 'POST', body: JSON.stringify({}) }),
    runContentAutoGeneration: () => request<any>('/developer/content/auto-run', { method: 'POST' }),

    getAutomationSettings: () => request<any>('/developer/settings/automation'),
    updateAutomationSettings: (body: any) =>
      request<any>('/developer/settings/automation', { method: 'PATCH', body: JSON.stringify(body) })
  },

  drafts: {
    list: (params?: string) => request<any>(`/drafts${params ? `?${params}` : ''}`),
    get: (id: string) => request<any>(`/drafts/${id}`),
    create: (body: any) => request<any>('/drafts', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: any) => request<any>(`/drafts/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: string) => request<any>(`/drafts/${id}`, { method: 'DELETE' }),
    archive: (id: string) => request<any>(`/drafts/${id}/archive`, { method: 'PUT' }),
    uploadMedia: (id: string, body: any) => request<any>(`/drafts/${id}/media`, { method: 'POST', body: JSON.stringify(body) }),
    queue: (id: string, body?: any) => request<any>(`/drafts/${id}/queue`, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
    publish: (id: string, body?: any) => request<any>(`/drafts/${id}/publish`, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
    retry: (id: string) => request<any>(`/drafts/${id}/retry`, { method: 'POST' }),
    history: (id: string) => request<any>(`/drafts/${id}/history`)
  }
};