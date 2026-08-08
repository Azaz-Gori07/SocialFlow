import { SocialProvider } from '../interfaces/socialProvider.interface';
import { TwitterProvider } from './twitter.provider';
import { LinkedInProvider } from './linkedin.provider';
import { MetaProvider } from './meta.provider';
import { YouTubeProvider } from './youtube.provider';
import { AppError } from '../../../shared/errors/appError';

export const SUPPORTED_PLATFORMS = ['twitter', 'linkedin', 'facebook', 'instagram', 'youtube'] as const;
export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

/**
 * Returns the provider for a platform.
 *
 * Rules (guideline §6, §21, §13):
 * - There is NO mock provider. An unconfigured platform returns a hard error —
 *   never a fabricated account, token or post id.
 * - Instagram is served by the Meta provider (Facebook Login mode).
 */
export class ProviderFactory {
  static getProvider(platform: string): SocialProvider {
    const clean = platform.toLowerCase().trim();

    switch (clean) {
      case 'twitter':
      case 'x':
        return new TwitterProvider();
      case 'linkedin':
        return new LinkedInProvider();
      case 'facebook':
      case 'instagram':
        return new MetaProvider();
      case 'youtube':
      case 'google':
        return new YouTubeProvider();
      default:
        throw AppError.badRequest(`Platform provider '${platform}' is not supported`);
    }
  }

  /** Throws a 503 with a clear message when the platform credentials are missing. */
  static getConfiguredProvider(platform: string): SocialProvider {
    const provider = ProviderFactory.getProvider(platform);
    if (!provider.isConfigured()) {
      throw AppError.providerNotConfigured(provider.platform);
    }
    return provider;
  }

  static isConfigured(platform: string): boolean {
    return ProviderFactory.getProvider(platform).isConfigured();
  }
}
export default ProviderFactory;
