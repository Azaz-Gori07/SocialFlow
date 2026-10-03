import { ThreadsProvider } from '../providers/threads.provider';
import { ProviderFactory, SUPPORTED_PLATFORMS } from '../providers/provider.factory';
import { env } from '../../../shared/config/env.config';

/**
 * Threads provider contract, verified against the official Meta Threads API:
 * own app credentials, threads.net authorize URL, graph.threads.net v1.0,
 * th_exchange_token / th_refresh_token grants, and the container → publish
 * media lifecycle. Nothing here may be mocked as "successful" without a real
 * provider id in the response.
 */
describe('ThreadsProvider', () => {
  const original = {
    clientId: env.Threads_CLIENT_ID,
    clientSecret: env.Threads_CLIENT_SECRET,
  };

  beforeEach(() => {
    env.Threads_CLIENT_ID = 'test-threads-app-id';
    env.Threads_CLIENT_SECRET = 'test-threads-app-secret';
  });

  afterAll(() => {
    env.Threads_CLIENT_ID = original.clientId;
    env.Threads_CLIENT_SECRET = original.clientSecret;
  });

  const ctx = (accessToken = 'tok') => ({
    tokens: { accessToken },
    account: {
      providerAccountId: 'th_user_1',
      accountType: 'profile' as const,
      username: 'socialflow',
      displayName: 'SocialFlow',
    },
  });

  const mockFetch = (impl: (url: string, init?: any) => Promise<{ ok: boolean; status?: number; json: any }>) => {
    const spy = jest.spyOn(global, 'fetch').mockImplementation(((url: any, init: any) =>
      impl(String(url), init)) as any);
    return spy;
  };

  const okJson = (body: any) => Promise.resolve({ ok: true, status: 200, json: async () => body });

  describe('configuration', () => {
    it('is not configured without both credentials', () => {
      env.Threads_CLIENT_ID = '';
      expect(new ThreadsProvider().isConfigured()).toBe(false);
      env.Threads_CLIENT_ID = 'test-threads-app-id';
      env.Threads_CLIENT_SECRET = '';
      expect(new ThreadsProvider().isConfigured()).toBe(false);
    });

    it('is configured with both credentials', () => {
      expect(new ThreadsProvider().isConfigured()).toBe(true);
    });

    it('uses its own app credentials, never the Facebook ones', () => {
      const url = new ThreadsProvider().getAuthorizationUrl({ state: 's', redirectUri: 'http://x/cb' });
      expect(new URL(url).searchParams.get('client_id')).toBe('test-threads-app-id');
    });
  });

  describe('registration', () => {
    it('is registered in the factory and SUPPORTED_PLATFORMS', () => {
      expect(SUPPORTED_PLATFORMS).toContain('threads');
      expect(ProviderFactory.getProvider('threads')).toBeInstanceOf(ThreadsProvider);
      expect(ProviderFactory.isConfigured('threads')).toBe(true);
    });

    it('no longer registers tiktok', () => {
      expect(SUPPORTED_PLATFORMS).not.toContain('tiktok' as any);
      expect(() => ProviderFactory.getProvider('tiktok')).toThrow(/not supported/i);
    });
  });

  describe('authorization URL', () => {
    it('uses the threads.net authorize host and the documented scopes', () => {
      const url = new ThreadsProvider().getAuthorizationUrl({ state: 'st', redirectUri: 'http://x/cb' });
      const params = new URL(url).searchParams;

      expect(url.startsWith('https://threads.net/oauth/authorize')).toBe(true);
      expect(params.get('response_type')).toBe('code');
      expect(params.get('state')).toBe('st');
      const scopes = (params.get('scope') || '').split(' ');
      expect(scopes).toEqual(expect.arrayContaining(['threads_basic', 'threads_content_publish']));
    });
  });

  describe('capabilities', () => {
    it('reports only what the adapter implements', () => {
      const caps = new ThreadsProvider().getCapabilities({
        providerAccountId: 'th_user_1',
        accountType: 'profile',
        username: 'socialflow',
        displayName: 'SocialFlow',
      });

      expect(caps.createPost).toBe(true);
      expect(caps.uploadImage).toBe(true);
      expect(caps.uploadVideo).toBe(true);
      expect(caps.deletePost).toBe(true);
      expect(caps.insights).toBe(true);
      // Threads exposes replies, not a comment listing; carousel/stories are not implemented.
      expect(caps.commentsRead).toBe(false);
      expect(caps.carousel).toBe(false);
      expect(caps.stories).toBe(false);
    });
  });

  describe('text publishing', () => {
    it('publishes with media_type TEXT and auto_publish_text, returning the real id', async () => {
      const spy = mockFetch(() => okJson({ id: 'th_post_1' }));

      const result = await new ThreadsProvider().createPost(ctx(), { content: 'hello threads' });

      const [url, init] = spy.mock.calls[0] as [string, any];
      expect(url).toBe('https://graph.threads.net/v1.0/th_user_1/threads');
      const body = JSON.parse(init.body);
      expect(body.media_type).toBe('TEXT');
      expect(body.text).toBe('hello threads');
      expect(body.auto_publish_text).toBe(true);
      expect(result.externalPostId).toBe('th_post_1');
      spy.mockRestore();
    });

    it('throws rather than fabricating success when Threads returns no id', async () => {
      const spy = mockFetch(() => okJson({}));
      await expect(new ThreadsProvider().createPost(ctx(), { content: 'x' })).rejects.toThrow(/no post id/i);
      spy.mockRestore();
    });

    it('rejects text beyond the documented 500-byte limit before calling the API', async () => {
      const spy = mockFetch(() => okJson({ id: 'never' }));
      await expect(new ThreadsProvider().createPost(ctx(), { content: 'a'.repeat(501) })).rejects.toThrow(
        /limited to 500 bytes/i
      );
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('media publishing', () => {
    it('creates a container then publishes it for an image', async () => {
      const spy = mockFetch((url) => {
        if (url.includes('/threads_publish')) return okJson({ id: 'th_media_9' });
        if (url.includes('fields=status')) return okJson({ status: 'FINISHED' });
        return okJson({ id: 'container_1' });
      });

      const result = await new ThreadsProvider().createPost(ctx(), {
        content: 'with image',
        media: [{ url: 'https://cdn.example.com/a.jpg', kind: 'image', alt: 'alt text' }],
      });

      const urls = spy.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.endsWith('/v1.0/th_user_1/threads'))).toBe(true);
      expect(urls.some((u) => u.includes('threads_publish?creation_id=container_1'))).toBe(true);
      expect(result.externalPostId).toBe('th_media_9');
      expect(result.metadata).toMatchObject({ containerId: 'container_1' });
      spy.mockRestore();
    });

    it('requires a publicly reachable media URL', async () => {
      const spy = mockFetch(() => okJson({ id: 'x' }));
      await expect(
        new ThreadsProvider().createPost(ctx(), {
          content: 'local file',
          media: [{ url: '/uploads/local.jpg', kind: 'image' }],
        })
      ).rejects.toThrow(/publicly accessible/i);
      spy.mockRestore();
    });

    it('rejects unsupported image formats', async () => {
      const spy = mockFetch(() => okJson({ id: 'x' }));
      await expect(
        new ThreadsProvider().createPost(ctx(), {
          content: 'gif',
          media: [{ url: 'https://cdn.example.com/a.gif', kind: 'image' }],
        })
      ).rejects.toThrow(/JPEG or PNG/i);
      spy.mockRestore();
    });

    it('rejects unsupported video formats', async () => {
      const spy = mockFetch(() => okJson({ id: 'x' }));
      await expect(
        new ThreadsProvider().createPost(ctx(), {
          content: 'webm',
          media: [{ url: 'https://cdn.example.com/a.webm', kind: 'video' }],
        })
      ).rejects.toThrow(/MOV or MP4/i);
      spy.mockRestore();
    });

    it('surfaces a container ERROR status with the provider reason', async () => {
      const spy = mockFetch((url) => {
        if (url.includes('fields=status')) return okJson({ status: 'ERROR', error_message: 'INVALID_DURATION' });
        return okJson({ id: 'container_2' });
      });

      await expect(
        new ThreadsProvider().createPost(ctx(), {
          content: 'bad video',
          media: [{ url: 'https://cdn.example.com/a.mp4', kind: 'video' }],
        })
      ).rejects.toThrow(/INVALID_DURATION/);
      spy.mockRestore();
    });

    it('rejects multi-asset posts because carousel is not implemented', async () => {
      const spy = mockFetch(() => okJson({ id: 'x' }));
      await expect(
        new ThreadsProvider().createPost(ctx(), {
          content: 'carousel',
          media: [
            { url: 'https://cdn.example.com/a.jpg', kind: 'image' },
            { url: 'https://cdn.example.com/b.jpg', kind: 'image' },
          ],
        })
      ).rejects.toThrow(/carousel/i);
      spy.mockRestore();
    });
  });

  describe('replies, insights and unsupported surfaces', () => {
    it('creates a reply via reply_to_id', async () => {
      const spy = mockFetch(() => okJson({ id: 'reply_1' }));
      const res = await new ThreadsProvider().replyToComment(ctx(), 'parent_post_1', 'nice work');
      const body = JSON.parse((spy.mock.calls[0] as any)[1].body);
      expect(body.reply_to_id).toBe('parent_post_1');
      expect(res.externalReplyId).toBe('reply_1');
      spy.mockRestore();
    });

    it('normalizes threads_insights into daily metrics', async () => {
      const spy = mockFetch(() =>
        okJson({
          data: [
            { name: 'views', values: [{ end_time: '2026-01-01T00:00:00+0000', value: 120 }] },
            { name: 'likes', values: [{ end_time: '2026-01-01T00:00:00+0000', value: 8 }] },
          ],
        })
      );

      const out = await new ThreadsProvider().getInsights(ctx(), { startDate: '2026-01-01', endDate: '2026-01-02' });
      expect(out).toHaveLength(1);
      expect(out[0].impressions).toBe(120);
      expect(out[0].engagement).toBe(8);
      spy.mockRestore();
    });

    it('does not pretend Threads has a comment listing', async () => {
      await expect(new ThreadsProvider().listComments()).rejects.toThrow(/replies rather than comments/i);
    });
  });
});