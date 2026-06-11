export enum NotificationType {
  POST_PUBLISHED = 'post_published',
  POST_FAILED = 'post_failed',
  NEW_COMMENT = 'new_comment',
  WORKSPACE_INVITE = 'workspace_invite',
  SUBSCRIPTION_UPDATE = 'subscription_update',
  ANALYTICS_ALERT = 'analytics_alert',
}

export interface Notification {
  _id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface NotificationPreferences {
  userId: string;
  email: {
    enabled: boolean;
    types: NotificationType[];
  };
  push: {
    enabled: boolean;
    types: NotificationType[];
  };
  inApp: {
    enabled: boolean;
    types: NotificationType[];
  };
}

export const DEFAULT_PREFERENCES: Omit<NotificationPreferences, 'userId'> = {
  email: {
    enabled: true,
    types: Object.values(NotificationType),
  },
  push: {
    enabled: true,
    types: Object.values(NotificationType),
  },
  inApp: {
    enabled: true,
    types: Object.values(NotificationType),
  },
};

export interface SocketEventMap {
  notification: Notification;
  'notification:read': { notificationId: string };
  'notification:readAll': { userId: string };
  'notification:deleted': { notificationId: string };
  'notifications:unread_count': { count: number };
}