"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const db_1 = require("../../database/db");
const appError_1 = require("../../shared/errors/appError");
const notification_types_1 = require("./notification.types");
const socket_service_1 = require("../../services/socket/socket.service");
const DB_DIR = process.env.DB_DIR || './data';
const PREFERENCES_FILE = path_1.default.join(DB_DIR, 'notification_preferences.json');
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
        // Send real-time notification via Socket.IO
        try {
            (0, socket_service_1.sendNotification)(data.userId, notification);
        }
        catch (err) {
            console.warn('⚠️ Failed to send real-time notification:', err);
        }
        return notification;
    }
    /**
     * Get all notifications for a user, sorted newest first.
     */
    async list(userId) {
        const notifications = (await db_1.db.notifications.find({
            userId,
        }));
        return notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    /**
     * Get unread notification count for a user.
     */
    async getUnreadCount(userId) {
        const notifications = (await db_1.db.notifications.find({
            userId,
            read: false,
        }));
        return notifications.length;
    }
    /**
     * Mark a single notification as read.
     */
    async markRead(notificationId, userId) {
        const notification = (await db_1.db.notifications.findById(notificationId));
        if (!notification) {
            throw appError_1.AppError.notFound('Notification not found');
        }
        if (notification.userId !== userId) {
            throw appError_1.AppError.forbidden("Cannot modify another user's notification");
        }
        await db_1.db.notifications.updateOne({ _id: notificationId }, { $set: { read: true } });
        // Send updated unread count
        const unreadCount = await this.getUnreadCount(userId);
        try {
            (0, socket_service_1.sendUnreadCount)(userId, unreadCount);
        }
        catch (err) {
            console.warn('⚠️ Failed to send unread count:', err);
        }
        return { ...notification, read: true };
    }
    /**
     * Mark all notifications as read for a user.
     */
    async markAllRead(userId) {
        await db_1.db.notifications.updateMany({ userId, read: false }, { $set: { read: true } });
        try {
            (0, socket_service_1.sendUnreadCount)(userId, 0);
        }
        catch (err) {
            console.warn('⚠️ Failed to send unread count:', err);
        }
        return 0;
    }
    /**
     * Delete a single notification.
     */
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
    /**
     * Get or create notification preferences for a user.
     */
    async getPreferences(userId) {
        const existing = this.readPreferencesFromFile(userId);
        if (existing) {
            return existing;
        }
        // Create default preferences
        const defaultPrefs = {
            userId,
            ...notification_types_1.DEFAULT_PREFERENCES,
        };
        this.writePreferencesToFile(userId, defaultPrefs);
        return defaultPrefs;
    }
    /**
     * Update notification preferences for a user.
     */
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
        this.writePreferencesToFile(userId, updated);
        return updated;
    }
    readPreferencesFromFile(userId) {
        try {
            if (!fs_1.default.existsSync(PREFERENCES_FILE)) {
                return null;
            }
            const data = fs_1.default.readFileSync(PREFERENCES_FILE, 'utf-8');
            const prefs = JSON.parse(data);
            return prefs.find((p) => p.userId === userId) || null;
        }
        catch {
            return null;
        }
    }
    writePreferencesToFile(userId, prefs) {
        try {
            let allPrefs = [];
            if (fs_1.default.existsSync(PREFERENCES_FILE)) {
                allPrefs = JSON.parse(fs_1.default.readFileSync(PREFERENCES_FILE, 'utf-8'));
            }
            const index = allPrefs.findIndex((p) => p.userId === userId);
            if (index >= 0) {
                allPrefs[index] = prefs;
            }
            else {
                allPrefs.push(prefs);
            }
            fs_1.default.writeFileSync(PREFERENCES_FILE, JSON.stringify(allPrefs, null, 2), 'utf-8');
        }
        catch (err) {
            console.error('Failed to save notification preferences:', err);
        }
    }
}
exports.NotificationService = NotificationService;
exports.default = NotificationService;
