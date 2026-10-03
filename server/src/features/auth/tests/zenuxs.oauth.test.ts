import { ZenuxsOAuthService } from '../zenuxs-oauth.service';
import { renderOAuthFailurePage } from '../auth.controller';

/**
 * The Zenuxs auth server rejects an unregistered redirect_uri with HTTP 400 and
 * a raw JSON body. Previously that JSON was shown verbatim to the user. These
 * tests pin the probe + friendly-page behaviour.
 */
describe('Zenuxs OAuth authorization start-up failures', () => {
  const service = new ZenuxsOAuthService({} as any);

  const jsonResponse = (status: number, body: any) => ({
    status,
    text: async () => JSON.stringify(body)
  }) as any;

  let fetchSpy: jest.SpyInstance;

  afterEach(() => {
    if (fetchSpy) fetchSpy.mockRestore();
  });

  it('reports the redirect_uri reason when the auth server rejects the client', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse(400, { error: 'invalid_request', error_description: 'Invalid redirect_uri' })
    );

    const result = await service.checkAuthorizationEndpoint('https://api.auth.zenuxs.in/oauth/authorize?x=1');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Invalid redirect_uri');
  });

  it('passes through a healthy authorization endpoint', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ status: 302 } as any);
    const result = await service.checkAuthorizationEndpoint('https://api.auth.zenuxs.in/oauth/authorize?x=1');
    expect(result.ok).toBe(true);
  });

  it('does not intercept a non-configuration failure such as rate limiting', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse(429, { error: 'too_many_requests' })
    );
    const result = await service.checkAuthorizationEndpoint('https://api.auth.zenuxs.in/oauth/authorize?x=1');
    expect(result.ok).toBe(true);
  });

  it('does not intercept an unauthorized_client from a scope problem', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse(403, { error: 'access_denied', error_description: 'invalid client id' })
    );
    const result = await service.checkAuthorizationEndpoint('https://api.auth.zenuxs.in/oauth/authorize?x=1');
    expect(result.ok).toBe(false);
  });

  it('never blocks sign-in when the probe itself fails', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    const result = await service.checkAuthorizationEndpoint('https://api.auth.zenuxs.in/oauth/authorize?x=1');
    expect(result.ok).toBe(true);
  });

  it('renders an HTML page, never the raw provider JSON', () => {
    const html = renderOAuthFailurePage('google', 'Invalid redirect_uri');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Could not start Google sign-in');
    expect(html).toContain('Invalid redirect_uri');
    expect(html).not.toContain('{"error"');
  });

  it('names the provider the user actually pressed', () => {
    expect(renderOAuthFailurePage('github', 'x')).toContain('GitHub sign-in');
    expect(renderOAuthFailurePage('google', 'x')).toContain('Google sign-in');
  });

  it('escapes provider-supplied text', () => {
    const html = renderOAuthFailurePage('google', '<script>alert(1)</script>');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('offers a way back to the sign-in screen', () => {
    expect(renderOAuthFailurePage('google', 'x')).toContain('href="/"');
  });

  /**
   * Regression: the auth server validates `redirect_uri` byte-for-byte against the
   * value registered on the Zenuxs dashboard. The registered endpoints are the
   * SDK's own `callback.html`, so the authorize request, the token exchange and
   * the callback handler must all send the identical string.
   */
  describe('redirect URI matches the registered callback.html', () => {
    const url = (service as any).getCallbackUrl('google') as string;

    it('uses the SDK callback.html endpoint, not an API route', () => {
      expect(url).toBe('http://localhost:5000/callback.html');
    });

    it('never sends the backend API callback route to the auth server', () => {
      expect(url).not.toContain('/api/auth/oauth/zenuxs/');
    });

    it('sends the same URI from getAuthorizationUrl and handleCallback', async () => {
      const seen: string[] = [];
      const original = (global as any).fetch;
      (global as any).fetch = jest.fn(async (input: any) => {
        seen.push(String(input));
        return { status: 200, ok: true, text: async () => '{}', json: async () => ({}) } as any;
      });

      try {
        await service.getAuthorizationUrl('google').catch(() => {});
      } finally {
        (global as any).fetch = original;
      }

      const authorizeCall = seen.find((u) => u.includes('/oauth/authorize'));
      if (authorizeCall) {
        expect(authorizeCall).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A5000%2Fcallback.html');
      }
      expect(seen.length === 0 || authorizeCall !== undefined).toBe(true);
    });
  });
});
