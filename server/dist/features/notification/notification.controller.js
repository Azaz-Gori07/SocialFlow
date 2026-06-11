"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationController = void 0;
const response_util_1 = require("../../shared/utils/response.util");
const appError_1 = require("../../shared/errors/appError");
class NotificationController {
    notificationService;
    constructor(notificationService) {
        this.notificationService = notificationService;
    }
    list = async (req, res, next) => {
        try {
            if (!req.user) {
                return next(appError_1.AppError.unauthorized());
            }
            const notifications = await this.notificationService.list(req.user.id);
            return response_util_1.ApiResponse.success(res, notifications, 'Notifications retrieved successfully');
        }
        catch (error) {
            next(error);
        }
    };
    getUnreadCount = async (req, res, next) => {
        try {
            if (!req.user) {
                return next(appError_1.AppError.unauthorized());
            }
            const count = await this.notificationService.getUnreadCount(req.user.id);
            return response_util_1.ApiResponse.success(res, { count }, 'Unread count retrieved successfully');
        }
        catch (error) {
            next(error);
        }
    };
    markRead = async (req, res, next) => {
        try {
            if (!req.user) {
                return next(appError_1.AppError.unauthorized());
            }
            const { id } = req.params;
            const notification = await this.notificationService.markRead(id, req.user.id);
            return response_util_1.ApiResponse.success(res, notification, 'Notification marked as read');
        }
        catch (error) {
            next(error);
        }
    };
    markAllRead = async (req, res, next) => {
        try {
            if (!req.user) {
                return next(appError_1.AppError.unauthorized());
            }
            await this.notificationService.markAllRead(req.user.id);
            return response_util_1.ApiResponse.success(res, null, 'All notifications marked as read');
        }
        catch (error) {
            next(error);
        }
    };
    delete = async (req, res, next) => {
        try {
            if (!req.user) {
                return next(appError_1.AppError.unauthorized());
            }
            const { id } = req.params;
            await this.notificationService.delete(id, req.user.id);
            return response_util_1.ApiResponse.success(res, null, 'Notification deleted successfully');
        }
        catch (error) {
            next(error);
        }
    };
    // Notification Preferences
    getPreferences = async (req, res, next) => {
        try {
            if (!req.user) {
                return next(appError_1.AppError.unauthorized());
            }
            const preferences = await this.notificationService.getPreferences(req.user.id);
            return response_util_1.ApiResponse.success(res, preferences, 'Preferences retrieved successfully');
        }
        catch (error) {
            next(error);
        }
    };
    updatePreferences = async (req, res, next) => {
        try {
            if (!req.user) {
                return next(appError_1.AppError.unauthorized());
            }
            const preferences = await this.notificationService.updatePreferences(req.user.id, req.body);
            return response_util_1.ApiResponse.success(res, preferences, 'Preferences updated successfully');
        }
        catch (error) {
            next(error);
        }
    };
}
exports.NotificationController = NotificationController;
exports.default = NotificationController;
