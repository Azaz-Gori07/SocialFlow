import { Response } from 'express';
import { db } from '../database/db';
import { AuthenticatedRequest } from '../middleware/auth';
import { SocialPlatform } from '../types';

/**
 * Latest + previous analytics document per account, resolved inside MongoDB
 * in one roundtrip instead of pulling the entire history over the wire and
 * sorting it in JS. (Analytics rows are cascade-deleted with their account,
 * so filtering by userId matches the account-scoped behavior exactly.)
 */
async function latestAnalyticsPairs(userId: string): Promise<Array<{ accountId: string; latest: any; prev: any }>> {
  const rows = await db.analytics.aggregate([
    { $match: { userId } },
    { $sort: { accountId: 1, date: -1 } },
    { $group: { _id: '$accountId', docs: { $push: '$$ROOT' } } },
    {
      $project: {
        accountId: '$_id',
        latest: { $arrayElemAt: ['$docs', 0] },
        prev: { $arrayElemAt: ['$docs', 1] }
      }
    }
  ]);
  return rows as any;
}

export const DashboardController = {
  getOverview: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const [accounts, pairs] = await Promise.all([
        db.socialAccounts.find({ userId }).select('platform'),
        latestAnalyticsPairs(userId)
      ]);
      if (accounts.length === 0) {
        return res.json({
          totalFollowers: 0,
          totalReach: 0,
          totalImpressions: 0,
          totalEngagement: 0,
          totalWatchTime: 0,
          totalClicks: 0,
          averageCtr: 0,
          growth: { followers: 0, reach: 0, impressions: 0, engagement: 0 },
          connectedPlatforms: []
        });
      }

      // Latest/previous record per account — computed by the aggregation above.
      const latestRecordsByAccount: Record<string, any> = {};
      const previousRecordsByAccount: Record<string, any> = {};
      for (const pair of pairs) {
        if (pair.latest) latestRecordsByAccount[pair.accountId] = pair.latest;
        if (pair.prev) previousRecordsByAccount[pair.accountId] = pair.prev;
      }

      let totalFollowers = 0;
      let totalReach = 0;
      let totalImpressions = 0;
      let totalEngagement = 0;
      let totalWatchTime = 0;
      let totalClicks = 0;
      let totalCtrSum = 0;
      let ctrCount = 0;

      let prevFollowers = 0;
      let prevReach = 0;
      let prevImpressions = 0;
      let prevEngagement = 0;

      for (const act of accounts) {
        const latest = latestRecordsByAccount[String(act._id)];
        const prev = previousRecordsByAccount[String(act._id)];

        if (latest) {
          totalFollowers += latest.followers;
          totalReach += latest.reach;
          totalImpressions += latest.impressions;
          totalEngagement += latest.engagement;
          totalWatchTime += latest.watchTime || 0;
          totalClicks += latest.clicks;
          totalCtrSum += latest.ctr;
          ctrCount++;
        }

        if (prev) {
          prevFollowers += prev.followers;
          prevReach += prev.reach;
          prevImpressions += prev.impressions;
          prevEngagement += prev.engagement;
        }
      }

      const getGrowthPercentage = (current: number, previous: number) => {
        if (previous === 0) return 0;
        return parseFloat((((current - previous) / previous) * 100).toFixed(1));
      };

      const averageCtr = ctrCount > 0 ? parseFloat((totalCtrSum / ctrCount).toFixed(4)) : 0;

      return res.json({
        totalFollowers,
        totalReach,
        totalImpressions,
        totalEngagement,
        totalWatchTime,
        totalClicks,
        averageCtr,
        growth: {
          followers: getGrowthPercentage(totalFollowers, prevFollowers),
          reach: getGrowthPercentage(totalReach, prevReach),
          impressions: getGrowthPercentage(totalImpressions, prevImpressions),
          engagement: getGrowthPercentage(totalEngagement, prevEngagement),
        },
        connectedPlatforms: accounts.map(a => a.platform)
      });
    } catch (error) {
      console.error('Get dashboard overview error', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },

  getGrowth: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      // Analytics rows are cascade-deleted with their account, so a userId
      // filter equals the old account-scoped filter — one query, no accounts
      // roundtrip needed.
      const analyticsRecords = await db.analytics.find({ userId }).sort({ date: 1 });

      // Group analytics by date
      const dataByDate: Record<string, {
        date: string;
        followers: number;
        reach: number;
        impressions: number;
        engagement: number;
        clicks: number;
      }> = {};

      for (const rec of analyticsRecords) {
        if (!dataByDate[rec.date]) {
          dataByDate[rec.date] = {
            date: rec.date,
            followers: 0,
            reach: 0,
            impressions: 0,
            engagement: 0,
            clicks: 0
          };
        }

        dataByDate[rec.date].followers += rec.followers;
        dataByDate[rec.date].reach += rec.reach;
        dataByDate[rec.date].impressions += rec.impressions;
        dataByDate[rec.date].engagement += rec.engagement;
        dataByDate[rec.date].clicks += rec.clicks;
      }

      // Sort dates chronologically
      const growthTimeline = Object.values(dataByDate).sort((a, b) => a.date.localeCompare(b.date));

      return res.json(growthTimeline);
    } catch (error) {
      console.error('Get dashboard growth timeline error', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },

  getPlatformBreakdown: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const [accounts, pairs] = await Promise.all([
        db.socialAccounts.find({ userId }).select('platform'),
        latestAnalyticsPairs(userId)
      ]);
      if (accounts.length === 0) {
        return res.json([]);
      }

      // Latest record for each account (from the one-roundtrip aggregate).
      const latestRecords: Record<string, any> = {};
      for (const pair of pairs) {
        if (pair.latest) latestRecords[pair.accountId] = pair.latest;
      }

      // Aggregate metrics by platform
      const platformStats: Record<SocialPlatform, {
        platform: SocialPlatform;
        followers: number;
        reach: number;
        impressions: number;
        engagement: number;
        accountsCount: number;
      }> = {} as any;

      for (const act of accounts) {
        const latest = latestRecords[String(act._id)];
        if (!latest) continue;

        const platform = act.platform as SocialPlatform;
        if (!platformStats[platform]) {
          platformStats[platform] = {
            platform: platform,
            followers: 0,
            reach: 0,
            impressions: 0,
            engagement: 0,
            accountsCount: 0
          };
        }

        platformStats[platform].followers += latest.followers;
        platformStats[platform].reach += latest.reach;
        platformStats[platform].impressions += latest.impressions;
        platformStats[platform].engagement += latest.engagement;
        platformStats[platform].accountsCount++;
      }

      return res.json(Object.values(platformStats));
    } catch (error) {
      console.error('Get platform breakdown error', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
};
