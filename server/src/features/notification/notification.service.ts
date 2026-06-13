import { db } from '../../database/db';
import { AppError } from '../../shared/errors/appError';
import {
  Notification,
  NotificationType,
  NotificationPreferences,
  DEFAULT_PREFERENCES,
} from './notification.types';
import { sendNotification, sendUnreadCount } from '../../services/socket/socket.service';

export class NotificationService {
  /**
   * Create a notification and send real-time if user is connected.
   */
  async create(data: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    metadata?: Record<string, any>;
  }): Promise<Notification> {
    const notification = (await db.notifications.create({
      userId: data.userId,
      type: data.type,
      title: data.title,
      message: data.message,
      read: false,
      metadata: data.metadata || {},
    })) as unknown as Notification;

    try {
      sendNotification(data.userId, notification);
    } catch (err) {
      console.warn('Failed to send real-time notification:', err);
    }

    return notification;
  }

  async list(userId: string): Promise<Notification[]> {
    const notifications = (await db.notifications.find({
      userId,
    })) as unknown as Notification[];
    return notifications.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getUnreadCount(userId: string): Promise<number> {
    const notifications = (await db.notifications.find({
      userId,
      read: false,
    })) as unknown as Notification[];
    return notifications.length;
  }

  async markRead(
    notificationId: string,
    userId: string
  ): Promise<Notification> {
    const notification = (await db.notifications.findById(
      notificationId
    )) as unknown as Notification | null;
    if (!notification) {
      throw AppError.notFound('Notification not found');
    }
    if (notification.userId !== userId) {
      throw AppError.forbidden("Cannot modify another user's notification");
    }

    await db.notifications.updateOne(
      { _id: notificationId },
      { $set: { read: true } }
    );

    const unreadCount = await this.getUnreadCount(userId);
    try {
      sendUnreadCount(userId, unreadCount);
    } catch (err) {
      console.warn('Failed to send unread count:', err);
    }

    return { ...notification, read: true };
  }

  async markAllRead(userId: string): Promise<number> {
    await db.notifications.updateMany(
      { userId, read: false },
      { $set: { read: true } }
    );

    try {
      sendUnreadCount(userId, 0);
    } catch (err) {
      console.warn('Failed to send unread count:', err);
    }

    return 0;
  }

  async delete(notificationId: string, userId: string): Promise<void> {
    const notification = (await db.notifications.findById(
      notificationId
    )) as unknown as Notification | null;
    if (!notification) {
      throw AppError.notFound('Notification not found');
    }
    if (notification.userId !== userId) {
      throw AppError.forbidden("Cannot delete another user's notification");
    }

    await db.notifications.deleteOne({ _id: notificationId });
  }

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const existing = await db.notificationPreferences.findOne({ userId });
    if (existing) {
      return {
        userId: existing.userId,
        email: existing.email || DEFAULT_PREFERENCES.email,
        push: existing.push || DEFAULT_PREFERENCES.push,
        inApp: existing.inApp || DEFAULT_PREFERENCES.inApp,
      };
    }

    const defaultPrefs = {
      userId,
      ...DEFAULT_PREFERENCES,
    };
    await db.notificationPreferences.create(defaultPrefs);
    return defaultPrefs;
  }

  async updatePreferences(
    userId: string,
    updates: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> {
    const current = await this.getPreferences(userId);

    const updated = {
      ...current,
      ...updates,
      userId,
      email: { ...current.email, ...(updates.email || {}) },
      push: { ...current.push, ...(updates.push || {}) },
      inApp: { ...current.inApp, ...(updates.inApp || {}) },
    };

    await db.notificationPreferences.updateOne(
      { userId },
      { $set: updated },
      { upsert: true }
    );

    return updated;
  }
}

export default NotificationService;