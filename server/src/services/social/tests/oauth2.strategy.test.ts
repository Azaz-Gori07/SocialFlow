import { OAuth2Strategy, OAuth2Config } from '../strategies/oauth2.strategy';

/**
 * Regression coverage for the empty-success-body case.
 *
 * LinkedIn's Posts API answers `POST /v2/posts` with 201 + `x-restli-id` and
 * NO body. A blind `response.json()` threw "Unexpected end of JSON input"
 * after the post had already been created, so a live post was marked failed
 * (and a retry would have duplicated it).
 */
class TestStrategy extends OAuth2Strategy {
  constructor() {
    super({
      clientId: 'id',
      clientSecret: 'secret',
      authUrl: 'https://example.com/auth',
      tokenUrl: 'https://example.com/token',
      platform: 'linkedin',
    } as OAuth2Config);
  }

  post<T>(url: string): Promise<T> {
    return this.apiPost<T>(url, 'token', { hello: 'world' });
  }
}

function emptyBodyResponse(headers: Record<string, string> = {}): Response {
  return {
    ok: true,
    status: 201,
    headers: new Headers(headers),
    text: async () => '',
    json: async () => {
      throw new SyntaxError('Unexpected end of JSON input');
    },
  } as unknown as Response;
}

describe('OAuth2Strategy.apiPost', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns the x-restli-id when the provider sends an empty 201 body', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      emptyBodyResponse({ 'x-restli-id': 'urn:li:share:1234567890' })
    );

    const result = await new TestStrategy().post<{ id?: string }>('https://api.linkedin.com/v2/posts');

    expect(result.id).toBe('urn:li:share:1234567890');
  });

  it('returns an empty object when the empty body carries no restli id', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(emptyBodyResponse());

    const result = await new TestStrategy().post<{ id?: string }>('https://api.linkedin.com/v2/posts');

    expect(result).toEqual({});
  });

  it('still parses a normal JSON success body', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => JSON.stringify({ id: '42' }),
    } as unknown as Response);

    const result = await new TestStrategy().post<{ id?: string }>('https://api.example.com/x');

    expect(result.id).toBe('42');
  });

  it('keeps the json() contract for minimal response doubles', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ id: 'double' }),
    } as unknown as Response);

    const result = await new TestStrategy().post<{ id?: string }>('https://api.example.com/x');

    expect(result.id).toBe('double');
  });

  it('throws a provider error for a non-JSON success body', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => '<html>not json</html>',
    } as unknown as Response);

    await expect(new TestStrategy().post('https://api.example.com/x')).rejects.toThrow(
      /non-JSON success response/
    );
  });
});
