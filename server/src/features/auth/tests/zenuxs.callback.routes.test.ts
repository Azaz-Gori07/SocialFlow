import request from 'supertest';
import express from 'express';
import zenuxsCallbackRouter from '../zenuxs.callback.routes';

/**
 * `/callback.html` is the registered redirect URI, but it is not where the token
 * exchange happens: the PKCE verifier only exists in the backend, so the SDK's own
 * browser exchange fails with `State mismatch`. These tests pin that the page
 * forwards the code to the backend callback instead, and never leaks a token.
 */
describe('Zenuxs callback page', () => {
  const buildApp = () => {
    const app = express();
    app.use(zenuxsCallbackRouter);
    return app;
  };

  let fetchSpy: jest.SpyInstance;
  afterEach(() => {
    if (fetchSpy) fetchSpy.mockRestore();
  });

  describe('with an authorization code', () => {
    it('forwards the code and state to the backend callback', async () => {
      const calls: string[] = [];
      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input: any) => {
        calls.push(String(input));
        return {
          status: 302,
          headers: new Headers({ location: 'http://localhost:5173/auth/callback#code=one-time&provider=zenuxs-google' }),
          json: async () => ({})
        } as any;
      });

      await request(buildApp())
        .get('/callback.html?code=abc123&state=st_1&client_id=f3b01e0825dd896d')
        .expect(200);

      expect(calls).toHaveLength(1);
      expect(calls[0]).toContain('/api/auth/oauth/zenuxs/browser/callback');
      expect(calls[0]).toContain('code=abc123');
      expect(calls[0]).toContain('state=st_1');
    });

    it('returns the user to SocialFlow, not to the SDK debug page', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => ({
        status: 302,
        headers: new Headers({ location: 'http://localhost:5173/auth/callback#code=one-time' }),
        json: async () => ({})
      }) as any);

      const res = await request(buildApp()).get('/callback.html?code=abc123&state=st_1');

      expect(res.status).toBe(200);
      expect(res.text).toContain('/auth/callback');
      expect(res.text).toContain('Signing you in');
    });

    it('renders no inline script, so the app CSP is never violated', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => ({
        status: 302,
        headers: new Headers({ location: 'http://localhost:5173/auth/callback#code=x' }),
        json: async () => ({})
      }) as any);

      const res = await request(buildApp()).get('/callback.html?code=abc123');
      expect(res.text).not.toContain('<script');
    });

    it('never embeds a provider token in the returned HTML', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => ({
        status: 302,
        headers: new Headers({ location: 'http://localhost:5173/auth/callback#code=one-time' }),
        json: async () => ({})
      }) as any);

      const res = await request(buildApp()).get('/callback.html?code=abc123');
      expect(res.text).not.toContain('access_token');
      expect(res.text).not.toContain('eyJ'); // JWT prefix
    });

    it('surfaces a readable failure when the backend rejects the code', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => ({
        status: 400,
        headers: new Headers(),
        json: async () => ({ message: 'Zenuxs OAuth callback failed: invalid_grant' })
      }) as any);

      const res = await request(buildApp()).get('/callback.html?code=expired');
      expect(res.status).toBe(400);
      expect(res.text).toContain('Could not complete sign-in');
      expect(res.text).toContain('invalid_grant');
    });

    it('does not throw when the backend is unreachable', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

      const res = await request(buildApp()).get('/callback.html?code=abc123');
      expect(res.status).toBe(502);
      expect(res.text).toContain('Could not reach the SocialFlow sign-in service');
    });

    // Regression: passing the backend's full pathname (already
    // /auth/callback) into the redirect builder produced
    // /auth/callback/auth/callback, so the client never saw the hash code.
    it('never doubles the callback path', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => ({
        status: 302,
        headers: new Headers({ location: 'http://localhost:5173/auth/callback#code=one-time&provider=local' }),
        json: async () => ({})
      }) as any);

      const res = await request(buildApp()).get('/callback.html?code=abc123');

      expect(res.text).toContain('http://localhost:5173/auth/callback#code=one-time');
      expect(res.text).not.toContain('/auth/callback/auth/callback');
      const href = res.text.match(/href="([^"]+)"/)?.[1] || '';
      expect(href).not.toContain('/auth/callback/auth/callback');
      expect(new URL(href).pathname).toBe('/auth/callback');
    });

    it('preserves the hash exactly once when the backend sends one', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => ({
        status: 302,
        headers: new Headers({ location: 'http://localhost:5173/auth/callback#code=abc&provider=zenuxs-google&isNew=false' }),
        json: async () => ({})
      }) as any);

      const res = await request(buildApp()).get('/callback.html?code=abc123');
      const href = res.text.match(/href="([^"]+)"/)?.[1] || '';
      // The href is HTML-escaped in the source (\ -> \), which a browser
      // decodes when reading the attribute, so decode before asserting.
      const u = new URL(href.replace(/&amp;/g, '&'));
      expect(u.pathname).toBe('/auth/callback');
      expect(u.hash).toBe('#code=abc&provider=zenuxs-google&isNew=false');
    });
  });

  describe('without an authorization code', () => {
    it('reports a provider error instead of following a broken flow', async () => {
      const res = await request(buildApp()).get('/callback.html?error=access_denied');
      expect(res.status).toBe(400);
      expect(res.text).toContain('access_denied');
      expect(res.text).toContain('Back to sign in');
    });

    it('falls back to the SDK page when opened with no params', async () => {
      const res = await request(buildApp()).get('/callback.html');
      expect([200, 404]).toContain(res.status);
    });
  });

  it('serves the SDK bundle with a JavaScript MIME type', async () => {
    const res = await request(buildApp()).get('/zenux-oauth.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('javascript');
  });

  it('escapes provider-supplied error text', async () => {
    const res = await request(buildApp()).get('/callback.html?error=%3Cscript%3Ealert(1)%3C/script%3E');
    expect(res.text).not.toContain('<script>alert(1)</script>');
  });
});