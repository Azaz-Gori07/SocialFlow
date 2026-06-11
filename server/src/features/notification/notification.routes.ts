import { Router } from 'express';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { authenticate } from '../../shared/middleware/rbac.middleware';

const router = Router();

// Instantiate dependency graph
const notificationService = new NotificationService();
const notificationController = new NotificationController(notificationService);

// GET /api/notifications - List all notifications for the authenticated user
router.get(
  '/',
  authenticate as any,
  notificationController.list as any
);

// GET /api/notifications/unread-count - Get unread notification count
router.get(
  '/unread-count',
  authenticate as any,
  notificationController.getUnreadCount as any
);

// PUT /api/notifications/read-all - Mark all notifications as read
router.put(
  '/read-all',
  authenticate as any,
  notificationController.markAllRead as any
);

// PUT /api/notifications/:id/read - Mark a single notification as read
router.put(
  '/:id/read',
  authenticate as any,
  notificationController.markRead as any
);

// DELETE /api/notifications/:id - Delete a single notification
router.delete(
  '/:id',
  authenticate as any,
  notificationController.delete as any
);

// Notification Preferences

// GET /api/notifications/preferences - Get notification preferences
router.get(
  '/preferences',
  authenticate as any,
  notificationController.getPreferences as any
);

// PUT /api/notifications/preferences - Update notification preferences
router.put(
  '/preferences',
  authenticate as any,
  notificationController.updatePreferences as any
);

export default router;
export { notificationController, notificationService };