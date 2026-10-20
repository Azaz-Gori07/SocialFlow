import { Response } from 'express';
import { db } from '../../database/db';
import { AuthenticatedRequest } from '../../middleware/auth';
import { DraftModel } from '../draft/draft.model';

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const truncate = (value: unknown, length = 140): string => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
};

/**
 * Global command-palette search.
 *
 * The palette advertised “search posts, drafts, accounts” but only filtered a
 * hardcoded navigation list. This searches the user's real content with a
 * bounded, escaped regex (no user-supplied regex operators) and returns at
 * most five hits per section.
 */
export const SearchController = {
  search: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const query = String(req.query.q || '').trim();
      if (query.length < 2) {
        return res.json({ query, drafts: [], accounts: [], comments: [], notifications: [] });
      }
      if (query.length > 80) {
        return res.status(400).json({ message: 'Search query is too long (max 80 characters)' });
      }

      const pattern = new RegExp(escapeRegex(query), 'i');

      const memberships = await db.workspaceMembers
        .find({ userId })
        .select('workspaceId')
        .lean();
      const workspaceIds = memberships.map((member: any) => member.workspaceId);

      const [drafts, accounts, comments, notifications] = await Promise.all([
        DraftModel.find({
          userId,
          $or: [{ caption: pattern }, { platform: pattern }]
        })
          .sort({ updatedAt: -1 })
          .limit(5)
          .lean(),
        db.socialAccounts
          .find({
            userId,
            $or: [{ username: pattern }, { displayName: pattern }, { platform: pattern }]
          })
          .limit(5)
          .lean(),
        workspaceIds.length
          ? db.comments
              .find({
                workspaceId: { $in: workspaceIds },
                $or: [
                  { message: pattern },
                  { postTitle: pattern },
                  { 'author.username': pattern },
                  { 'author.displayName': pattern }
                ]
              })
              .sort({ createdAt: -1 })
              .limit(5)
              .lean()
          : Promise.resolve([]),
        db.notifications
          .find({ userId, $or: [{ title: pattern }, { message: pattern }] })
          .sort({ createdAt: -1 })
          .limit(5)
          .lean()
      ]);

      return res.json({
        query,
        drafts: (drafts as any[]).map((draft) => ({
          id: String(draft._id),
          type: 'draft',
          title: truncate(draft.caption || 'Untitled draft', 90),
          subtitle: `${draft.platform || 'unknown'} · ${draft.status || 'draft'}`,
          createdAt: draft.updatedAt || draft.createdAt
        })),
        accounts: (accounts as any[]).map((account) => ({
          id: String(account._id),
          type: 'account',
          title: account.displayName || account.username,
          subtitle: `@${account.username || 'unknown'} · ${account.platform}`,
          platform: account.platform,
          username: account.username
        })),
        comments: (comments as any[]).map((comment) => ({
          id: String(comment._id),
          type: 'comment',
          title: truncate(comment.message, 90),
          subtitle: `@${comment.author?.username || 'unknown'} · ${comment.platform || 'social'}`,
          status: comment.status,
          createdAt: comment.createdAt
        })),
        notifications: (notifications as any[]).map((notification) => ({
          id: String(notification._id),
          type: 'notification',
          title: truncate(notification.title, 90),
          subtitle: truncate(notification.message, 90),
          read: notification.read,
          createdAt: notification.createdAt
        }))
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message || 'Search failed' });
    }
  }
};

export default SearchController;
