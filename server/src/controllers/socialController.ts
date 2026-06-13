import { Response } from 'express';
import { db } from '../database/db';
import { AuthenticatedRequest } from '../middleware/auth';
import { SocialPlatform } from '../types';

export const SocialController = {
  getAccounts: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const accounts = await db.socialAccounts.find({ userId });
      return res.json(accounts);
    } catch (error) {
      console.error('Get social accounts error', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },

  connectAccount: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { platform, username, displayName } = req.body;
      if (!platform || !username || !displayName) {
        return res.status(400).json({ message: 'Platform, username, and displayName are required' });
      }

      // Verify valid platform
      const validPlatforms: SocialPlatform[] = ['twitter', 'instagram', 'facebook', 'linkedin', 'youtube', 'tiktok'];
      if (!validPlatforms.includes(platform)) {
        return res.status(400).json({ message: 'Invalid social platform' });
      }

      // Check if already connected
      const existing = await db.socialAccounts.findOne({ userId, platform, username });
      if (existing) {
        return res.status(400).json({ message: 'This account is already connected' });
      }

      // Create connected account
      const avatarSeeds: Record<SocialPlatform, string> = {
        twitter: 'tw_',
        instagram: 'ig_',
        facebook: 'fb_',
        linkedin: 'li_',
        youtube: 'yt_',
        tiktok: 'tt_'
      };
      
      const newAccount = await db.socialAccounts.create({
        userId,
        platform,
        accountId: 'act_' + Math.random().toString(36).substring(2, 9),
        username,
        displayName,
        avatarUrl: `https://api.dicebear.com/7.x/identicon/svg?seed=${avatarSeeds[platform as SocialPlatform]}${username}`,
        accessToken: 'mock_token_' + Math.random().toString(36).substring(2, 15),
        refreshToken: 'mock_refresh_' + Math.random().toString(36).substring(2, 15),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
        metadata: {
          followerCount: Math.floor(Math.random() * 50000) + 1200,
          verified: Math.random() > 0.7
        }
      });

      // No seed data generated — real analytics and comments come from platform API integrations

      // Log activity
      await db.activityLogs.create({
        userId,
        action: 'ACCOUNT_CONNECTED',
        details: `Connected ${platform} account @${username}`
      });

      return res.status(201).json(newAccount);
    } catch (error) {
      console.error('Connect social account error', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },

  disconnectAccount: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { id } = req.params;
      const account = await db.socialAccounts.findOne({ _id: id, userId });
      if (!account) {
        return res.status(404).json({ message: 'Social account not found' });
      }

      await db.socialAccounts.deleteOne({ _id: id });
      
      // Delete associated analytics
      await db.analytics.deleteMany({ accountId: id });
      // Delete associated comments
      await db.comments.deleteMany({ accountId: id });

      // Log activity
      await db.activityLogs.create({
        userId,
        action: 'ACCOUNT_DISCONNECTED',
        details: `Disconnected ${account.platform} account @${account.username}`
      });

      return res.json({ message: 'Social account disconnected successfully' });
    } catch (error) {
      console.error('Disconnect social account error', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
};
