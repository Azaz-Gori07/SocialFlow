"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommentController = void 0;
const db_1 = require("../database/db");
exports.CommentController = {
    getComments: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId)
                return res.status(401).json({ message: 'Unauthorized' });
            const { platform, status } = req.query;
            // Fetch accounts of the user to only get comments for accounts owned by this user
            const accounts = await db_1.db.socialAccounts.find({ userId });
            if (accounts.length === 0) {
                return res.json([]);
            }
            const accountIds = accounts.map(a => a._id);
            const query = { accountId: { $in: accountIds } };
            if (platform) {
                query.platform = platform;
            }
            if (status) {
                query.status = status;
            }
            const comments = await db_1.db.comments.find(query);
            // Sort newest comments first
            const sortedComments = comments.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            return res.json(sortedComments);
        }
        catch (error) {
            console.error('Get comments error', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },
    replyToComment: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId)
                return res.status(401).json({ message: 'Unauthorized' });
            const { commentId, message } = req.body;
            if (!commentId || !message) {
                return res.status(400).json({ message: 'Comment ID and message are required' });
            }
            const comment = await db_1.db.comments.findOne({ _id: commentId });
            if (!comment) {
                return res.status(404).json({ message: 'Comment not found' });
            }
            const user = await db_1.db.users.findById(userId);
            const authorName = user ? user.fullName : 'Admin';
            // Create reply object
            const reply = {
                _id: 'rpl_' + Math.random().toString(36).substring(2, 9),
                author: {
                    username: user?.email.split('@')[0] || 'admin',
                    displayName: authorName,
                    avatarUrl: user?.avatarUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=admin`,
                    isSystemUser: true
                },
                message,
                createdAt: new Date().toISOString()
            };
            // Append reply and mark resolved if desired (or keep it open but updated)
            const updated = await db_1.db.comments.updateOne({ _id: commentId }, {
                $push: { replies: reply },
                $set: { status: 'resolved' } // auto resolve upon reply
            });
            // Log activity
            await db_1.db.activityLogs.create({
                userId,
                action: 'COMMENT_REPLIED',
                details: `Replied to comment by @${comment.author.username} on ${comment.platform}`
            });
            return res.json(updated);
        }
        catch (error) {
            console.error('Reply to comment error', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },
    resolveComment: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId)
                return res.status(401).json({ message: 'Unauthorized' });
            const { id } = req.params;
            const { status } = req.body; // 'resolved' or 'unresolved'
            if (!status || (status !== 'resolved' && status !== 'unresolved')) {
                return res.status(400).json({ message: 'Valid status is required' });
            }
            const comment = await db_1.db.comments.findOne({ _id: id });
            if (!comment) {
                return res.status(404).json({ message: 'Comment not found' });
            }
            const updated = await db_1.db.comments.updateOne({ _id: id }, { $set: { status } });
            return res.json(updated);
        }
        catch (error) {
            console.error('Resolve comment error', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },
    assignComment: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId)
                return res.status(401).json({ message: 'Unauthorized' });
            const { id } = req.params;
            const { assignedTo } = req.body; // userId of workspace member
            const comment = await db_1.db.comments.findOne({ _id: id });
            if (!comment) {
                return res.status(404).json({ message: 'Comment not found' });
            }
            const updated = await db_1.db.comments.updateOne({ _id: id }, { $set: { assignedTo } });
            return res.json(updated);
        }
        catch (error) {
            console.error('Assign comment error', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    }
};
