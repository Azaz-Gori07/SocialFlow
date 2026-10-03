import { classifyProviderError, isPermanentStatus, isRetryableStatus } from './providerError';

/**
 * Regression cover for the retry classifier. A permanent status must never be
 * retried just because the provider sent no recognisable error code — that
 * replays an invalid request until it dead-letters.
 */
describe('classifyProviderError', () => {
  describe('without a provider code', () => {
    it.each([400, 401, 403, 404])('treats HTTP %i as permanent', (status) => {
      expect(classifyProviderError('meta', 'bad request', status).retryable).toBe(false);
      expect(isPermanentStatus(status)).toBe(true);
    });

    it('treats 429 as retryable', () => {
      expect(classifyProviderError('x', 'slow down', 429).retryable).toBe(true);
      expect(isRetryableStatus(429)).toBe(true);
    });

    it.each([500, 502, 503])('treats HTTP %i as retryable', (status) => {
      expect(classifyProviderError('meta', 'server error', status).retryable).toBe(true);
    });
  });

  describe('with a provider code', () => {
    // The 4th argument is the provider response body; the code is extracted from it.
    const metaBody = (code: number | string) => ({ error: { code } });

    it.each([
      ['100', 'meta'], // invalid parameter
      ['190', 'meta'], // expired token
      ['200', 'meta'], // permission
      ['10', 'meta'],   // permission denied
      ['87', 'x'],      // client not permitted
      ['89', 'x'],      // revoked token
      ['403', 'linkedin']
    ])('treats provider code %s as permanent even with a retryable status', (code, platform) => {
      expect(classifyProviderError(platform, 'nope', 500, metaBody(code)).retryable).toBe(false);
    });

    it("honours X's own rate-limit code 88 as retryable", () => {
      expect(classifyProviderError('x', 'rate limited', 400, metaBody(88)).retryable).toBe(true);
    });

    it('treats an unknown code on a permanent status as permanent', () => {
      expect(classifyProviderError('meta', 'bad', 400, metaBody(999)).retryable).toBe(false);
    });

    it('keeps the provider code and status on the thrown error', () => {
      const err = classifyProviderError('meta', 'nope', 400, metaBody(100));
      expect(err.providerCode).toBe('100');
      expect(err.status).toBe(400);
      expect(err.platform).toBe('meta');
    });
  });
});