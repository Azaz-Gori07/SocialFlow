import { MetaProvider } from '../providers/meta.provider';
import { env } from '../../../shared/config/env.config';

/**
 * Facebook Login for Business: `config_id` must reach the Meta authorization URL
 * when configured, and must be absent otherwise so the standard Facebook Login
 * flow is untouched. App ID / secret keep coming from FACEBOOK_CLIENT_ID /
 * FACEBOOK_CLIENT_SECRET — never from the configuration ID.
 */
describe('MetaProvider — Facebook Login for Business', () => {
  const original = {
    clientId: env.meta.clientId,
    clientSecret: env.meta.clientSecret,
    loginConfigId: env.meta.loginConfigId,
  };

  afterEach(() => {
    env.meta.clientId = original.clientId;
    env.meta.clientSecret = original.clientSecret;
    env.meta.loginConfigId = original.loginConfigId;
  });

  const parse = (url: string) => new URL(url).searchParams;

  it('sends config_id on the authorization URL when the configuration ID is set', () => {
    env.meta.clientId = 'test-app-id';
    env.meta.clientSecret = 'test-app-secret';
    env.meta.loginConfigId = 'test-config-id';

    const url = new MetaProvider().getAuthorizationUrl({ state: 'state-123', redirectUri: 'http://localhost:5000/cb' });
    const params = parse(url);

    expect(params.get('config_id')).toBe('test-config-id');
  });

  it('omits config_id entirely when the configuration ID is absent', () => {
    env.meta.clientId = 'test-app-id';
    env.meta.clientSecret = 'test-app-secret';
    env.meta.loginConfigId = '';

    const url = new MetaProvider().getAuthorizationUrl({ state: 'state-123', redirectUri: 'http://localhost:5000/cb' });

    expect(parse(url).has('config_id')).toBe(false);
    // The standard flow still works: no throw, and the usual params are present.
    expect(url.startsWith('https://www.facebook.com/')).toBe(true);
    expect(parse(url).get('client_id')).toBe('test-app-id');
    expect(parse(url).get('redirect_uri')).toBe('http://localhost:5000/cb');
    expect(parse(url).get('response_type')).toBe('code');
    expect(parse(url).get('state')).toBe('state-123');
  });

  it('takes the App ID and secret from FACEBOOK_CLIENT_* , never from the configuration ID', () => {
    env.meta.clientId = 'test-app-id';
    env.meta.clientSecret = 'test-app-secret';
    env.meta.loginConfigId = 'test-config-id';

    const params = parse(new MetaProvider().getAuthorizationUrl({ state: 's', redirectUri: 'http://localhost:5000/cb' }));

    expect(params.get('client_id')).toBe('test-app-id');
    expect(params.get('client_id')).not.toBe(params.get('config_id'));
  });

  it('preserves the required Meta scopes and does not leak the config id into the token exchange', async () => {
    env.meta.clientId = 'test-app-id';
    env.meta.clientSecret = 'test-app-secret';
    env.meta.loginConfigId = 'test-config-id';

    const params = parse(new MetaProvider().getAuthorizationUrl({ state: 's', redirectUri: 'http://localhost:5000/cb' }));
    const scopes = (params.get('scope') || '').split(' ');

    expect(scopes).toEqual(expect.arrayContaining([
      'pages_show_list',
      'pages_manage_posts',
      'pages_read_engagement',
      'pages_read_user_content',
      'instagram_business_basic',
      'instagram_business_content_publish',
      'instagram_business_manage_comments',
      'instagram_business_manage_insights',
    ]));

    // The configuration ID is authorization-URL only; it must never be POSTed to
    // the token endpoint.
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'short-lived' }),
    } as any);

    await new MetaProvider().exchangeCode({ code: 'c', redirectUri: 'http://localhost:5000/cb' });

    const bodies = fetchSpy.mock.calls.map((c) => String((c[1] as any)?.body || ''));
    expect(bodies.join(' ')).not.toContain('test-config-id');
    fetchSpy.mockRestore();
  });

  it('isConfigured() reflects the App ID / secret only, not the configuration ID', () => {
    env.meta.clientId = 'test-app-id';
    env.meta.clientSecret = 'test-app-secret';
    expect(new MetaProvider().isConfigured()).toBe(true);

    env.meta.clientId = '';
    expect(new MetaProvider().isConfigured()).toBe(false);

    // A configuration ID alone must not make an unconfigured app look ready.
    env.meta.loginConfigId = 'test-config-id';
    env.meta.clientId = '';
    expect(new MetaProvider().isConfigured()).toBe(false);
  });
});