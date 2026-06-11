import { Response } from 'express';
import { db } from '../database/db';
import { AuthenticatedRequest } from '../middleware/auth';
import { SocialPlatform } from '../types';

export const DashboardController = {
  getOverview: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const accounts = await db.socialAccounts.find({ userId });
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

      // Fetch analytics for all accounts
      const accountIds = accounts.map(a => a._id);
      const analyticsRecords = await db.analytics.find({ accountId: { $in: accountIds } });

      // Group records by date to find the latest data points
      const latestRecordsByAccount: Record<string, any> = {};
      const previousRecordsByAccount: Record<string, any> = {};

      // Sort analytics by date descending
      const sortedRecords = [...analyticsRecords].sort((a, b) => b.date.localeCompare(a.date));

      for (const record of sortedRecords) {
        if (!latestRecordsByAccount[record.accountId]) {
          latestRecordsByAccount[record.accountId] = record;
        } else if (!previousRecordsByAccount[record.accountId]) {
          previousRecordsByAccount[record.accountId] = record;
        }
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
        const latest = latestRecordsByAccount[act._id];
        const prev = previousRecordsByAccount[act._id];

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

      const accounts = await db.socialAccounts.find({ userId });
      if (accounts.length === 0) {
        return res.json([]);
      }

      const accountIds = accounts.map(a => a._id);
      const analyticsRecords = await db.analytics.find({ accountId: { $in: accountIds } });

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

      const accounts = await db.socialAccounts.find({ userId });
      if (accounts.length === 0) {
        return res.json([]);
      }

      const accountIds = accounts.map(a => a._id);
      const analyticsRecords = await db.analytics.find({ accountId: { $in: accountIds } });

      // Get latest record for each account
      const latestRecords: Record<string, any> = {};
      const sortedRecords = [...analyticsRecords].sort((a, b) => b.date.localeCompare(a.date));
      for (const rec of sortedRecords) {
        if (!latestRecords[rec.accountId]) {
          latestRecords[rec.accountId] = rec;
        }
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
        const latest = latestRecords[act._id];
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
