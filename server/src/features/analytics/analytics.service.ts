import { db } from '../../database/db';
import { SocialService } from '../social/social.service';
import { SocialRepository } from '../social/social.repository';
import { OAuthConnectionRepository } from '../social/oauthConnection.repository';
import { OAuthTransactionRepository } from '../social/oauthTransaction.repository';
import { ProviderFactory } from '../../services/social/providers/provider.factory';
import { ProviderError } from '../../services/social/errors/providerError';
import { SocialPlatform } from '../../types';

const socialService = new SocialService(
  new SocialRepository(),
  new OAuthConnectionRepository(),
  new OAuthTransactionRepository()
);

const DATE_ISO = (d: Date): string => d.toISOString().slice(0, 10);

export interface SyncMetricsResult {
  syncedAccounts: number;
  skippedAccounts: string[];
  failedAccounts: string[];
}

export interface GrowthInsight {
  title: string;
  recommendation: string;
  platform: SocialPlatform;
  metricImpact: string;
}

/**
 * Real analytics ingestion and insight computation.
 * No mock data: every number returned here comes from provider API responses
 * stored in the analytics collection, or is derived from stored metrics.
 */
export class AnalyticsService {
  /**
   * Pull per-day metrics from every connected account whose provider
   * exposes getInsights. Errors on one account never block the others.
   */
  static async syncMetrics(userId: string, days = 7): Promise<SyncMetricsResult> {
    const accounts = await db.socialAccounts.find({ userId, status: 'active' });
    const result: SyncMetricsResult = {
      syncedAccounts: 0,
      skippedAccounts: [],
      failedAccounts: [],
    };

    const start = new Date();
    start.setUTCDate(start.getUTCDate() - (days - 1));
    const range = { startDate: DATE_ISO(start), endDate: DATE_ISO(new Date()) };

    for (const account of accounts) {
      if (!account.capabilities?.getInsights) {
        result.skippedAccounts.push(account.platform);
        continue;
      }

      try {
        const bundle = await socialService.resolveAccountTokenBundle(String(account._id));
        const provider = ProviderFactory.getConfiguredProvider(account.platform);
        if (!provider.getInsights) {
          result.skippedAccounts.push(account.platform);
          continue;
        }

        const insights = await provider.getInsights(
          { tokens: { accessToken: bundle.accessToken }, account: bundle.account as any },
          range
        );

        for (const day of insights) {
          if (!day.date) continue;
          await db.analytics.updateOne(
            { accountId: String(account._id), date: day.date },
            {
              $set: {
                userId,
                platform: account.platform,
                followers: day.followers ?? 0,
                reach: day.reach ?? 0,
                impressions: day.impressions ?? 0,
                engagement: day.engagement ?? 0,
                clicks: day.clicks ?? 0,
                source: 'provider',
                lastSyncedAt: new Date(),
              },
            },
            { upsert: true }
          );
        }

        result.syncedAccounts++;
      } catch (error) {
        if (error instanceof ProviderError) {
          result.failedAccounts.push(account.platform);
          continue;
        }
        result.failedAccounts.push(account.platform);
      }
    }

    return result;
  }

  /** Raw stored metrics for a user, newest first. Never fabricated. */
  static async getMetrics(userId: string, from?: string, to?: string) {
    const filter: Record<string, unknown> = { userId };
    if (from || to) {
      filter.date = {
        ...(from ? { $gte: from } : {}),
        ...(to ? { $lte: to } : {}),
      };
    }
    return db.analytics.find(filter).sort({ date: -1 });
  }

  /**
   * Insights computed exclusively from stored provider metrics.
   * Returns an empty array when there is no data - no fabricated recommendations.
   */
  static async getGrowthInsights(userId: string): Promise<GrowthInsight[]> {
    const records = await db.analytics.find({ userId });
    if (records.length === 0) return [];

    const insights: GrowthInsight[] = [];
    const byPlatform = new Map<string, typeof records>();
    for (const r of records) {
      const list = byPlatform.get(r.platform) ?? [];
      list.push(r);
      byPlatform.set(r.platform, list);
    }

    for (const [rawPlatform, list] of byPlatform) {
      const platform = rawPlatform as SocialPlatform;
      const reach = list.reduce((sum, r) => sum + (r.reach || 0), 0);
      const engagement = list.reduce((sum, r) => sum + (r.engagement || 0), 0);
      const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const followerDelta = (last?.followers || 0) - (first?.followers || 0);

      if (reach > 0) {
        insights.push({
          title: `${platform} Top Reach Period`,
          recommendation: `Your ${platform} account reached ${reach.toLocaleString()} people across ${list.length} recorded day(s).`,
          platform,
          metricImpact: `${reach.toLocaleString()} reach`,
        });
      }
      if (followerDelta !== 0) {
        insights.push({
          title: `${platform} Follower Trend`,
          recommendation: `Followers ${followerDelta > 0 ? 'grew by' : 'changed by'} ${Math.abs(followerDelta).toLocaleString()} between ${first.date} and ${last.date}.`,
          platform,
          metricImpact: `${followerDelta > 0 ? '+' : ''}${followerDelta.toLocaleString()} followers`,
        });
      }
      if (engagement > 0) {
        insights.push({
          title: `${platform} Engagement`,
          recommendation: `Total measured engagement on ${platform} is ${engagement.toLocaleString()} interactions.`,
          platform,
          metricImpact: `${engagement.toLocaleString()} engagements`,
        });
      }
    }

    return insights;
  }
}
