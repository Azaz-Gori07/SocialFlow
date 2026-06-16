const API_BASE = import.meta.env.VITE_BACKEND_API_URL?.replace(/\/$/, '');

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

// Global API helper
async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  
  if (!options.skipAuth) {
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

  // Auto token refresh on 401 Unauthorized
  if (response.status === 401 && !options.skipAuth) {
    const storedRefreshToken = localStorage.getItem('refresh_token');
    if (storedRefreshToken) {
      try {
        const refreshResp = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: storedRefreshToken })
        });
        
        if (refreshResp.ok) {
          const refreshJson = await refreshResp.json();
          // The refresh endpoint returns { data: { accessToken, refreshToken, expiresIn } }
          const tokenData = refreshJson.data || refreshJson;
          localStorage.setItem('access_token', tokenData.accessToken);
          localStorage.setItem('refresh_token', tokenData.refreshToken);
          
          // Retry the original request
          headers.set('Authorization', `Bearer ${tokenData.accessToken}`);
          response = await fetch(`${API_BASE}${endpoint}`, { ...config, headers });
        } else {
          // Refresh token is expired too, redirect to login
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('user');
          window.dispatchEvent(new Event('auth-logout'));
        }
      } catch (err) {
        console.error('Auto refresh token failed', err);
      }
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `API request failed with status ${response.status}`);
  }

  const json = await response.json() as any;
  
  // Unwrap standard API envelope: { success, data, message, errors, timestamp }
  // If response has a `data` field, return data. Otherwise return the whole response.
  if (json && typeof json === 'object' && 'data' in json && 'success' in json) {
    return json.data as T;
  }
  
  return json as T;
}

export const api = {
  auth: {
    register: (body: any) => request<any>('/auth/register', { method: 'POST', body: JSON.stringify(body), skipAuth: true }),
    login: (body: any) => request<any>('/auth/login', { method: 'POST', body: JSON.stringify(body), skipAuth: true }),
    verifyOtp: (body: any) => request<any>('/auth/verify-otp', { method: 'POST', body: JSON.stringify(body), skipAuth: true }),
    logout: () => request<any>('/auth/logout', { method: 'POST', skipAuth: true }),
    me: () => request<any>('/auth/me')
  },
  
  social: {
    getAccounts: () => request<any[]>('/social/accounts'),
    connect: (body: any) => request<any>('/social/connect-direct', { method: 'POST', body: JSON.stringify(body) }),
    disconnect: (id: string) => request<any>(`/social/accounts/${id}`, { method: 'DELETE' }),
    connectOAuth: (platform: string) => request<{ url: string }>(`/social/connect/${platform}`)
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
    bulkSchedule: (posts: any[]) => request<any>('/posts/schedule', { method: 'POST', body: JSON.stringify({ posts }) })
  },
  
  comments: {
    list: (platform?: string, status?: string) => {
      const params = new URLSearchParams();
      if (platform) params.append('platform', platform);
      if (status) params.append('status', status);
      const query = params.toString();
      return request<any[]>(`/comments${query ? `?${query}` : ''}`);
    },
    reply: (commentId: string, message: string) => request<any>('/comments/reply', { method: 'POST', body: JSON.stringify({ commentId, message }) }),
    resolve: (id: string, status: 'resolved' | 'unresolved') => request<any>(`/comments/resolve/${id}`, { method: 'PUT', body: JSON.stringify({ status }) }),
    assign: (id: string, assignedTo: string) => request<any>(`/comments/assign/${id}`, { method: 'PUT', body: JSON.stringify({ assignedTo }) })
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
  
  logs: {
    list: () => request<any[]>('/logs')
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
    publish: (id: string) => request<any>(`/drafts/${id}/publish`, { method: 'POST' }),
    retry: (id: string) => request<any>(`/drafts/${id}/retry`, { method: 'POST' }),
    history: (id: string) => request<any>(`/drafts/${id}/history`)
  }
};