import { Response, NextFunction } from 'express';
import { NotificationService } from './notification.service';
import { ApiResponse } from '../../shared/utils/response.util';
import { AuthenticatedRequest } from '../../shared/middleware/rbac.middleware';
import { AppError } from '../../shared/errors/appError';

export class NotificationController {
  constructor(private notificationService: NotificationService) {}

  list = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized());
      }

      const notifications = await this.notificationService.list(req.user.id);
      return ApiResponse.success(res, notifications, 'Notifications retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  getUnreadCount = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized());
      }

      const count = await this.notificationService.getUnreadCount(req.user.id);
      return ApiResponse.success(res, { count }, 'Unread count retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  markRead = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized());
      }

      const { id } = req.params;
      const notification = await this.notificationService.markRead(id, req.user.id);
      return ApiResponse.success(res, notification, 'Notification marked as read');
    } catch (error) {
      next(error);
    }
  };

  markAllRead = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized());
      }

      await this.notificationService.markAllRead(req.user.id);
      return ApiResponse.success(res, null, 'All notifications marked as read');
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized());
      }

      const { id } = req.params;
      await this.notificationService.delete(id, req.user.id);
      return ApiResponse.success(res, null, 'Notification deleted successfully');
    } catch (error) {
      next(error);
    }
  };

  // Notification Preferences
  getPreferences = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized());
      }

      const preferences = await this.notificationService.getPreferences(req.user.id);
      return ApiResponse.success(res, preferences, 'Preferences retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  updatePreferences = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized());
      }

      const preferences = await this.notificationService.updatePreferences(req.user.id, req.body);
      return ApiResponse.success(res, preferences, 'Preferences updated successfully');
    } catch (error) {
      next(error);
    }
  };
}

export default NotificationController;