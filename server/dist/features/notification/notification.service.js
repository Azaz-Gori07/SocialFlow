"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const db_1 = require("../../database/db");
const appError_1 = require("../../shared/errors/appError");
const notification_types_1 = require("./notification.types");
const socket_service_1 = require("../../services/socket/socket.service");
class NotificationService {
    /**
     * Create a notification and send real-time if user is connected.
     */
    async create(data) {
        const notification = (await db_1.db.notifications.create({
            userId: data.userId,
            type: data.type,
            title: data.title,
            message: data.message,
            read: false,
            metadata: data.metadata || {},
        }));
        try {
            (0, socket_service_1.sendNotification)(data.userId, notification);
        }
        catch (err) {
            console.warn('Failed to send real-time notification:', err);
        }
        return notification;
    }
    async list(userId) {
        const notifications = (await db_1.db.notifications.find({
            userId,
        }));
        return notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    async getUnreadCount(userId) {
        const notifications = (await db_1.db.notifications.find({
            userId,
            read: false,
        }));
        return notifications.length;
    }
    async markRead(notificationId, userId) {
        const notification = (await db_1.db.notifications.findById(notificationId));
        if (!notification) {
            throw appError_1.AppError.notFound('Notification not found');
        }
        if (notification.userId !== userId) {
            throw appError_1.AppError.forbidden("Cannot modify another user's notification");
        }
        await db_1.db.notifications.updateOne({ _id: notificationId }, { $set: { read: true } });
        const unreadCount = await this.getUnreadCount(userId);
        try {
            (0, socket_service_1.sendUnreadCount)(userId, unreadCount);
        }
        catch (err) {
            console.warn('Failed to send unread count:', err);
        }
        return { ...notification, read: true };
    }
    async markAllRead(userId) {
        await db_1.db.notifications.updateMany({ userId, read: false }, { $set: { read: true } });
        try {
            (0, socket_service_1.sendUnreadCount)(userId, 0);
        }
        catch (err) {
            console.warn('Failed to send unread count:', err);
        }
        return 0;
    }
    async delete(notificationId, userId) {
        const notification = (await db_1.db.notifications.findById(notificationId));
        if (!notification) {
            throw appError_1.AppError.notFound('Notification not found');
        }
        if (notification.userId !== userId) {
            throw appError_1.AppError.forbidden("Cannot delete another user's notification");
        }
        await db_1.db.notifications.deleteOne({ _id: notificationId });
    }
    async getPreferences(userId) {
        const existing = await db_1.db.notificationPreferences.findOne({ userId });
        if (existing) {
            return {
                userId: existing.userId,
                email: existing.email || notification_types_1.DEFAULT_PREFERENCES.email,
                push: existing.push || notification_types_1.DEFAULT_PREFERENCES.push,
                inApp: existing.inApp || notification_types_1.DEFAULT_PREFERENCES.inApp,
            };
        }
        const defaultPrefs = {
            userId,
            ...notification_types_1.DEFAULT_PREFERENCES,
        };
        await db_1.db.notificationPreferences.create(defaultPrefs);
        return defaultPrefs;
    }
    async updatePreferences(userId, updates) {
        const current = await this.getPreferences(userId);
        const updated = {
            ...current,
            ...updates,
            userId,
            email: { ...current.email, ...(updates.email || {}) },
            push: { ...current.push, ...(updates.push || {}) },
            inApp: { ...current.inApp, ...(updates.inApp || {}) },
        };
        await db_1.db.notificationPreferences.updateOne({ userId }, { $set: updated }, { upsert: true });
        return updated;
    }
}
exports.NotificationService = NotificationService;
exports.default = NotificationService;
