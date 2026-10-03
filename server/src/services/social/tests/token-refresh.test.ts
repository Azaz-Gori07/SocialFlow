import { DeliveryEngine } from '../delivery.engine';
import { ProviderError } from '../errors/providerError';
import { ProviderFactory } from '../providers/provider.factory';

/**
 * Token lifecycle (master plan §20): a provider 401 must trigger exactly one
 * refresh + retry, not kill the delivery. A second failure, or a provider that
 * cannot refresh, is reported instead of looping.
 */
describe('DeliveryEngine — token refresh and retry', () => {
  const post: any = {
    _id: 'post_1',
    userId: 'user_1',
    platforms: ['twitter'],
    content: 'hello',
    media: [],
    status: 'publishing',
    deliveries: [],
  };
  const account: any = {
    _id: 'acc_1',
    userId: 'user_1',
    platform: 'twitter',
    providerAccountId: 'tw_1',
    accountType: 'profile',
    username: 'qa',
    displayName: 'QA',
    encryptedAccessToken: 'iv:cipher',
  };
  const delivery: any = {
    socialAccountId: 'acc_1',
    platform: 'twitter',
    status: 'publishing',
    attempts: 0,
    maxAttempts: 5,
    deadLettered: false,
  };

  const build = (over: {
    createPost?: jest.Mock;
    refresh?: jest.Mock;
    resolveBundle?: jest.Mock;
  }) => {
    const engine = new DeliveryEngine({} as any);
    const socialService = {
      resolveAccountTokenBundle: over.resolveBundle ?? jest.fn().mockResolvedValue({
        account,
        accessToken: 'stale-token',
        refreshToken: 'refresh-1',
      }),
      refreshAccountTokenForDelivery: over.refresh ?? jest.fn().mockResolvedValue('fresh-token'),
    };
    (engine as any).socialService = socialService;

    const provider = {
      platform: 'twitter',
      provider: 'twitter',
      getCapabilities: jest.fn().mockReturnValue({ createPost: true, uploadImage: false, uploadVideo: false }),
      createPost: over.createPost ?? jest.fn().mockResolvedValue({ externalPostId: 'ext_1' }),
      resolvePostUrl: jest.fn().mockReturnValue('https://x.com/qa/status/ext_1'),
    };
    jest.spyOn(ProviderFactory, 'getConfiguredProvider').mockReturnValue(provider as any);
    jest.spyOn(engine as any, 'markPublished').mockResolvedValue(delivery);
    jest.spyOn(engine as any, 'postUpdated').mockResolvedValue(delivery);

    return { engine, socialService, provider };
  };

  afterEach(() => jest.restoreAllMocks());

  it('refreshes once and retries after a 401, then succeeds', async () => {
    const createPost = jest
      .fn()
      .mockRejectedValueOnce(new ProviderError('expired', 'twitter', 401, '190', false))
      .mockResolvedValueOnce({ externalPostId: 'ext_ok' });
    const refresh = jest.fn().mockResolvedValue('fresh-token');

    const { engine } = build({ createPost, refresh });
    const outcome = await engine.publishDelivery(post, delivery);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(createPost).toHaveBeenCalledTimes(2);
    expect(outcome.ok).toBe(true);
    // The retry must actually use the refreshed token.
    expect(createPost.mock.calls[1][0].tokens.accessToken).toBe('fresh-token');
  });

  it('refreshes for a provider expired-token code even without HTTP 401', async () => {
    const createPost = jest
      .fn()
      .mockRejectedValueOnce(new ProviderError('token expired', 'twitter', undefined, '89', false))
      .mockResolvedValueOnce({ externalPostId: 'ext_ok' });
    const refresh = jest.fn().mockResolvedValue('fresh-token');

    const { engine } = build({ createPost, refresh });
    const outcome = await engine.publishDelivery(post, delivery);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(outcome.ok).toBe(true);
  });

  it('does not retry a second time when the retry also fails', async () => {
    const createPost = jest
      .fn()
      .mockRejectedValueOnce(new ProviderError('expired', 'twitter', 401, undefined, false))
      .mockRejectedValueOnce(new ProviderError('still bad', 'twitter', 401, undefined, false));
    const refresh = jest.fn().mockResolvedValue('fresh-token');

    const { engine } = build({ createPost, refresh });
    const outcome = await engine.publishDelivery(post, delivery);

    expect(createPost).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(outcome.ok).toBe(false);
  });

  it('never refreshes for a non-auth failure (400/403/unsupported media)', async () => {
    for (const status of [400, 403, 500]) {
      const createPost = jest.fn().mockRejectedValue(new ProviderError('nope', 'twitter', status, undefined, false));
      const refresh = jest.fn().mockResolvedValue('fresh-token');
      const { engine } = build({ createPost, refresh });

      await engine.publishDelivery(post, delivery);

      expect(refresh).not.toHaveBeenCalled();
      expect(createPost).toHaveBeenCalledTimes(1);
      jest.restoreAllMocks();
    }
  });

  it('surfaces the original error when refresh returns null (account needs reconnect)', async () => {
    const createPost = jest.fn().mockRejectedValue(new ProviderError('expired', 'twitter', 401, undefined, false));
    const refresh = jest.fn().mockResolvedValue(null);

    const { engine } = build({ createPost, refresh });
    const outcome = await engine.publishDelivery(post, delivery);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(createPost).toHaveBeenCalledTimes(1);
    expect(outcome.ok).toBe(false);
  });

  it('does not loop forever when refresh itself throws', async () => {
    const createPost = jest.fn().mockRejectedValue(new ProviderError('expired', 'twitter', 401, undefined, false));
    const refresh = jest.fn().mockRejectedValue(new Error('refresh endpoint down'));

    const { engine } = build({ createPost, refresh });
    const outcome = await engine.publishDelivery(post, delivery);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(createPost).toHaveBeenCalledTimes(1);
    expect(outcome.ok).toBe(false);
  });
});