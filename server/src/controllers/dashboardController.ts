import { Response } from 'express';
import { db } from '../database/db';
import { DraftModel } from '../features/draft/draft.model';
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
      // Content activity is always available (posts and drafts are our own
      // records), unlike provider metrics. The dashboard uses these counts
      // when no analytics rows exist — e.g. LinkedIn exposes no reach API.
      const [publishedCount, scheduledCount, draftCount, failedCount] = await Promise.all([
        db.posts.countDocuments({ userId, status: 'published' }),
        db.posts.countDocuments({ userId, status: 'scheduled' }),
        DraftModel.countDocuments({ userId, status: { $in: ['draft', 'ready'] } }),
        db.posts.countDocuments({ userId, status: { $in: ['failed', 'partial_failure'] } })
      ]);
      const content = {
        published: publishedCount,
        scheduled: scheduledCount,
        drafts: draftCount,
        failed: failedCount
      };
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
          connectedPlatforms: [],
          content
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
        connectedPlatforms: accounts.map(a => a.platform),
        content
      });
    } catch (error) {
      console.error('Get dashboard overview error', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },

  /**
   * Daily analytics for one platform. Powers the Analytics CTR channel filter;
   * the aggregate endpoint above intentionally merges every platform.
   */
  getPlatformGrowth: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const platform = String(req.query.platform || '').trim().toLowerCase();
      if (!platform) {
        return res.status(400).json({ message: 'platform query parameter is required' });
      }

      const accounts = await db.socialAccounts.find({ userId, platform: platform as any }).select('_id').lean();
      const accountIds = accounts.map((account: any) => String(account._id));
      const rows = await db.analytics
        .find({
          userId,
          $or: [{ platform }, { accountId: { $in: accountIds } }]
        })
        .sort({ date: 1 });

      const byDate = new Map<string, any>();
      for (const row of rows) {
        const key = row.date;
        if (!byDate.has(key)) {
          byDate.set(key, {
            date: key,
            followers: 0,
            reach: 0,
            impressions: 0,
            engagement: 0,
            clicks: 0
          });
        }
        const point = byDate.get(key);
        point.followers += row.followers || 0;
        point.reach += row.reach || 0;
        point.impressions += row.impressions || 0;
        point.engagement += row.engagement || 0;
        point.clicks += row.clicks || 0;
      }

      return res.json(Array.from(byDate.values()));
    } catch (error: any) {
      return res.status(500).json({ message: error.message || 'Failed to load platform analytics' });
    }
  },

  getGrowth: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const growthTimeline = await db.analytics.aggregate([
        { $match: { userId } },
        {
          $group: {
            _id: '$date',
            followers: { $sum: '$followers' },
            reach: { $sum: '$reach' },
            impressions: { $sum: '$impressions' },
            engagement: { $sum: '$engagement' },
            clicks: { $sum: '$clicks' }
          }
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            _id: 0,
            date: '$_id',
            followers: 1,
            reach: 1,
            impressions: 1,
            engagement: 1,
            clicks: 1
          }
        }
      ]);

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
        // Count the connection even before the first analytics sync. Skipping
        // metric-less accounts made a connected profile look disconnected in
        // the Analytics empty state ("No connected accounts").
        platformStats[platform].accountsCount++;

        const latest = latestRecords[String(act._id)];
        if (!latest) continue;

        platformStats[platform].followers += latest.followers ?? 0;
        platformStats[platform].reach += latest.reach ?? 0;
        platformStats[platform].impressions += latest.impressions ?? 0;
        platformStats[platform].engagement += latest.engagement ?? 0;
      }

      return res.json(Object.values(platformStats));
    } catch (error) {
      console.error('Get platform breakdown error', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
};
