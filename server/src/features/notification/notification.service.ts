import fs from 'fs';
import path from 'path';
import { db } from '../../database/db';
import { AppError } from '../../shared/errors/appError';
import {
  Notification,
  NotificationType,
  NotificationPreferences,
  DEFAULT_PREFERENCES,
} from './notification.types';
import { sendNotification, sendUnreadCount } from '../../services/socket/socket.service';

const DB_DIR = process.env.DB_DIR || './data';
const PREFERENCES_FILE = path.join(DB_DIR, 'notification_preferences.json');

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

    // Send real-time notification via Socket.IO
    try {
      sendNotification(data.userId, notification);
    } catch (err) {
      console.warn('⚠️ Failed to send real-time notification:', err);
    }

    return notification;
  }

  /**
   * Get all notifications for a user, sorted newest first.
   */
  async list(userId: string): Promise<Notification[]> {
    const notifications = (await db.notifications.find({
      userId,
    })) as unknown as Notification[];
    return notifications.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Get unread notification count for a user.
   */
  async getUnreadCount(userId: string): Promise<number> {
    const notifications = (await db.notifications.find({
      userId,
      read: false,
    })) as unknown as Notification[];
    return notifications.length;
  }

  /**
   * Mark a single notification as read.
   */
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

    // Send updated unread count
    const unreadCount = await this.getUnreadCount(userId);
    try {
      sendUnreadCount(userId, unreadCount);
    } catch (err) {
      console.warn('⚠️ Failed to send unread count:', err);
    }

    return { ...notification, read: true };
  }

  /**
   * Mark all notifications as read for a user.
   */
  async markAllRead(userId: string): Promise<number> {
    await db.notifications.updateMany(
      { userId, read: false },
      { $set: { read: true } }
    );

    try {
      sendUnreadCount(userId, 0);
    } catch (err) {
      console.warn('⚠️ Failed to send unread count:', err);
    }

    return 0;
  }

  /**
   * Delete a single notification.
   */
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

  /**
   * Get or create notification preferences for a user.
   */
  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const existing = this.readPreferencesFromFile(userId);
    if (existing) {
      return existing;
    }

    // Create default preferences
    const defaultPrefs: NotificationPreferences = {
      userId,
      ...DEFAULT_PREFERENCES,
    };
    this.writePreferencesToFile(userId, defaultPrefs);
    return defaultPrefs;
  }

  /**
   * Update notification preferences for a user.
   */
  async updatePreferences(
    userId: string,
    updates: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> {
    const current = await this.getPreferences(userId);

    const updated: NotificationPreferences = {
      ...current,
      ...updates,
      userId,
      email: { ...current.email, ...(updates.email || {}) },
      push: { ...current.push, ...(updates.push || {}) },
      inApp: { ...current.inApp, ...(updates.inApp || {}) },
    };

    this.writePreferencesToFile(userId, updated);
    return updated;
  }

  private readPreferencesFromFile(
    userId: string
  ): NotificationPreferences | null {
    try {
      if (!fs.existsSync(PREFERENCES_FILE)) {
        return null;
      }
      const data = fs.readFileSync(PREFERENCES_FILE, 'utf-8');
      const prefs: NotificationPreferences[] = JSON.parse(data);
      return prefs.find((p) => p.userId === userId) || null;
    } catch {
      return null;
    }
  }

  private writePreferencesToFile(
    userId: string,
    prefs: NotificationPreferences
  ): void {
    try {
      let allPrefs: NotificationPreferences[] = [];
      if (fs.existsSync(PREFERENCES_FILE)) {
        allPrefs = JSON.parse(fs.readFileSync(PREFERENCES_FILE, 'utf-8'));
      }

      const index = allPrefs.findIndex((p) => p.userId === userId);
      if (index >= 0) {
        allPrefs[index] = prefs;
      } else {
        allPrefs.push(prefs);
      }

      fs.writeFileSync(
        PREFERENCES_FILE,
        JSON.stringify(allPrefs, null, 2),
        'utf-8'
      );
    } catch (err) {
      console.error('Failed to save notification preferences:', err);
    }
  }
}

export default NotificationService;