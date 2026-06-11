import { Response } from 'express';
import { db } from '../database/db';
import { AuthenticatedRequest } from '../middleware/auth';
import { Post, SocialPlatform } from '../types';

export const PostController = {
  getPosts: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { status } = req.query;
      const query: any = { userId };
      
      if (status) {
        query.status = status;
      }

      const posts = await db.posts.find(query);
      // Sort by scheduled time or creation time descending
      const sortedPosts = posts.sort((a, b) => {
        const dateA = a.scheduledAt || a.createdAt;
        const dateB = b.scheduledAt || b.createdAt;
        return dateB.localeCompare(dateA);
      });

      return res.json(sortedPosts);
    } catch (error) {
      console.error('Get posts error', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },

  getPostById: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { id } = req.params;
      const post = await db.posts.findOne({ _id: id, userId });
      if (!post) {
        return res.status(404).json({ message: 'Post not found' });
      }

      return res.json(post);
    } catch (error) {
      console.error('Get post by ID error', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },

  createPost: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { platforms, content, platformContent, media, scheduledAt } = req.body;

      if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
        return res.status(400).json({ message: 'At least one target platform is required' });
      }

      if (!content) {
        return res.status(400).json({ message: 'Post content is required' });
      }

      const isScheduled = !!scheduledAt;
      const status = isScheduled ? 'scheduled' : 'published';

      const post = await db.posts.create({
        userId,
        platforms: platforms as SocialPlatform[],
        content,
        platformContent: platformContent || {},
        media: media || [],
        status,
        scheduledAt: isScheduled ? new Date(scheduledAt).toISOString() : undefined,
        publishedAt: isScheduled ? undefined : new Date().toISOString()
      });

      // Log activity
      await db.activityLogs.create({
        userId,
        action: isScheduled ? 'POST_SCHEDULED' : 'POST_PUBLISHED',
        details: `${isScheduled ? 'Scheduled' : 'Published'} post to [${platforms.join(', ')}]`
      });

      if (!isScheduled) {
        // Send a notification that it was published
        await db.notifications.create({
          userId,
          title: 'Post Published Successfully',
          message: `Your post was successfully published to ${platforms.join(', ')}.`,
          read: false,
          type: 'post_published'
        });
      }

      return res.status(201).json(post);
    } catch (error) {
      console.error('Create post error', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },

  updatePost: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { id } = req.params;
      const { platforms, content, platformContent, media, scheduledAt, status } = req.body;

      const post = await db.posts.findOne({ _id: id, userId });
      if (!post) {
        return res.status(404).json({ message: 'Post not found' });
      }

      if (post.status === 'published') {
        return res.status(400).json({ message: 'Cannot edit an already published post' });
      }

      const updateFields: any = {};
      if (platforms) updateFields.platforms = platforms;
      if (content) updateFields.content = content;
      if (platformContent) updateFields.platformContent = platformContent;
      if (media) updateFields.media = media;
      if (status) updateFields.status = status;
      
      if (scheduledAt !== undefined) {
        updateFields.scheduledAt = scheduledAt ? new Date(scheduledAt).toISOString() : null;
        updateFields.status = scheduledAt ? 'scheduled' : 'pending';
      }

      const updated = await db.posts.updateOne({ _id: id }, { $set: updateFields });

      return res.json(updated);
    } catch (error) {
      console.error('Update post error', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },

  deletePost: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { id } = req.params;
      const post = await db.posts.findOne({ _id: id, userId });
      if (!post) {
        return res.status(404).json({ message: 'Post not found' });
      }

      await db.posts.deleteOne({ _id: id });

      // Log activity
      await db.activityLogs.create({
        userId,
        action: 'POST_DELETED',
        details: `Deleted scheduled post for platforms [${post.platforms.join(', ')}]`
      });

      return res.json({ message: 'Post deleted successfully' });
    } catch (error) {
      console.error('Delete post error', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },

  bulkSchedule: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { posts } = req.body; // Expect array of post designs
      if (!posts || !Array.isArray(posts) || posts.length === 0) {
        return res.status(400).json({ message: 'An array of posts is required' });
      }

      const createdPosts = [];
      for (const p of posts) {
        const { platforms, content, scheduledAt } = p;
        if (!platforms || !content || !scheduledAt) continue;

        const newPost = await db.posts.create({
          userId,
          platforms: platforms as SocialPlatform[],
          content,
          platformContent: {},
          media: [],
          status: 'scheduled',
          scheduledAt: new Date(scheduledAt).toISOString()
        });
        createdPosts.push(newPost);
      }

      // Log activity
      await db.activityLogs.create({
        userId,
        action: 'BULK_POSTS_SCHEDULED',
        details: `Bulk scheduled ${createdPosts.length} posts`
      });

      return res.status(201).json({
        message: `Successfully bulk-scheduled ${createdPosts.length} posts`,
        posts: createdPosts
      });
    } catch (error) {
      console.error('Bulk schedule posts error', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
};
