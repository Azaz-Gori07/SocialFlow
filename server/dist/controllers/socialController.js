"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocialController = void 0;
const db_1 = require("../database/db");
exports.SocialController = {
    getAccounts: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId)
                return res.status(401).json({ message: 'Unauthorized' });
            const accounts = await db_1.db.socialAccounts.find({ userId });
            return res.json(accounts);
        }
        catch (error) {
            console.error('Get social accounts error', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },
    connectAccount: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId)
                return res.status(401).json({ message: 'Unauthorized' });
            const { platform, username, displayName } = req.body;
            if (!platform || !username || !displayName) {
                return res.status(400).json({ message: 'Platform, username, and displayName are required' });
            }
            // Verify valid platform
            const validPlatforms = ['twitter', 'instagram', 'facebook', 'linkedin', 'youtube', 'tiktok'];
            if (!validPlatforms.includes(platform)) {
                return res.status(400).json({ message: 'Invalid social platform' });
            }
            // Check if already connected
            const existing = await db_1.db.socialAccounts.findOne({ userId, platform, username });
            if (existing) {
                return res.status(400).json({ message: 'This account is already connected' });
            }
            // Create connected account
            const avatarSeeds = {
                twitter: 'tw_',
                instagram: 'ig_',
                facebook: 'fb_',
                linkedin: 'li_',
                youtube: 'yt_',
                tiktok: 'tt_'
            };
            const newAccount = await db_1.db.socialAccounts.create({
                userId,
                platform,
                accountId: 'act_' + Math.random().toString(36).substring(2, 9),
                username,
                displayName,
                avatarUrl: `https://api.dicebear.com/7.x/identicon/svg?seed=${avatarSeeds[platform]}${username}`,
                accessToken: 'mock_token_' + Math.random().toString(36).substring(2, 15),
                refreshToken: 'mock_refresh_' + Math.random().toString(36).substring(2, 15),
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
                metadata: {
                    followerCount: Math.floor(Math.random() * 50000) + 1200,
                    verified: Math.random() > 0.7
                }
            });
            // Generate seed analytics for this brand new account so the dashboard has immediately visualizable data
            const today = new Date();
            for (let i = 14; i >= 0; i--) {
                const dateString = new Date(today.getTime() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                // Base growth simulation
                const randomModifier = Math.sin(i / 2) * 500 + (Math.random() * 200);
                const followerCount = Math.floor(10000 + (14 - i) * 150 + randomModifier);
                const reach = Math.floor(followerCount * 1.5 + (Math.random() * 5000));
                const impressions = Math.floor(reach * 2 + (Math.random() * 8000));
                const engagement = Math.floor(reach * 0.08 + (Math.random() * 400));
                const clicks = Math.floor(engagement * 0.15 + (Math.random() * 30));
                await db_1.db.analytics.create({
                    userId,
                    accountId: newAccount._id,
                    platform: platform,
                    date: dateString,
                    followers: followerCount,
                    reach,
                    impressions,
                    engagement,
                    watchTime: platform === 'youtube' || platform === 'tiktok' ? Math.floor(reach * 0.5) : 0,
                    clicks,
                    ctr: impressions > 0 ? parseFloat((clicks / impressions).toFixed(4)) : 0
                });
            }
            // Generate seed comments for the connected account
            const seedComments = {
                twitter: [
                    'Wow, this tool looks super useful! Is there a free trial?',
                    'Can we schedule threads or just single posts?',
                    'I need this for my SaaS launch!'
                ],
                instagram: [
                    'Love the aesthetic! 😍',
                    'Send me details in DM please!',
                    'Is this live yet? Awesome work!'
                ],
                facebook: [
                    'Great launch post. Wish you guys the best.',
                    'Is this suitable for agencies managing 20+ clients?',
                    'Looks interesting, will check it out.'
                ],
                linkedin: [
                    'Brilliant execution on the MVP. Looking forward to see it scale.',
                    'How does this handle LinkedIn Carousel PDFs?',
                    'Insightful update. Shared with my team.'
                ],
                youtube: [
                    'Amazing walkthrough video!',
                    'Subbed. Can you do a tutorial on setting up OAuth connections?',
                    'The audio quality in this video is pristine. Content is gold!'
                ],
                tiktok: [
                    'Wait this is actually a lifesaver tool 😂',
                    'Repurposing blog post to thread? Bro that is cheat codes.',
                    'Does it have auto captions?'
                ]
            };
            const platformComments = seedComments[platform] || ['Nice!'];
            for (let j = 0; j < platformComments.length; j++) {
                await db_1.db.comments.create({
                    platform: platform,
                    accountId: newAccount._id,
                    postId: 'pst_' + Math.random().toString(36).substring(2, 9),
                    postTitle: `Launch post for ${platform}`,
                    author: {
                        username: `user_${Math.floor(Math.random() * 1000)}`,
                        displayName: `Creator Fan ${j + 1}`,
                        avatarUrl: `https://api.dicebear.com/7.x/pixel-art/svg?seed=commenter_${platform}_${j}`
                    },
                    message: platformComments[j],
                    status: 'unresolved'
                });
            }
            // Log activity
            await db_1.db.activityLogs.create({
                userId,
                action: 'ACCOUNT_CONNECTED',
                details: `Connected ${platform} account @${username}`
            });
            return res.status(201).json(newAccount);
        }
        catch (error) {
            console.error('Connect social account error', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },
    disconnectAccount: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId)
                return res.status(401).json({ message: 'Unauthorized' });
            const { id } = req.params;
            const account = await db_1.db.socialAccounts.findOne({ _id: id, userId });
            if (!account) {
                return res.status(404).json({ message: 'Social account not found' });
            }
            await db_1.db.socialAccounts.deleteOne({ _id: id });
            // Delete associated analytics
            await db_1.db.analytics.deleteMany({ accountId: id });
            // Delete associated comments
            await db_1.db.comments.deleteMany({ accountId: id });
            // Log activity
            await db_1.db.activityLogs.create({
                userId,
                action: 'ACCOUNT_DISCONNECTED',
                details: `Disconnected ${account.platform} account @${account.username}`
            });
            return res.json({ message: 'Social account disconnected successfully' });
        }
        catch (error) {
            console.error('Disconnect social account error', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    }
};
