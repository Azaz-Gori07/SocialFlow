import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../services/api';
import {
  Bell,
  CheckCheck,
  Trash2,
  AlertCircle,
  CheckCircle2,
  MessageSquare,
  Users,
  CreditCard,
  TrendingUp,
  Send,
  RefreshCw,
  Clock,
} from 'lucide-react';

const NOTIFICATION_ICONS: Record<string, React.FC<any>> = {
  post_published: Send,
  post_failed: AlertCircle,
  new_comment: MessageSquare,
  workspace_invite: Users,
  subscription_update: CreditCard,
  analytics_alert: TrendingUp,
};

const NOTIFICATION_COLORS: Record<string, string> = {
  post_published: '#10b981',
  post_failed: '#ef4444',
  new_comment: '#3b82f6',
  workspace_invite: '#8b5cf6',
  subscription_update: '#f59e0b',
  analytics_alert: '#06b6d4',
};

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const NotificationCenter: React.FC = () => {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all'); // 'all' | 'unread'

  const fetchNotifications = useCallback(async () => {
    try {
      const list = await api.notifications.list();
      setNotifications(list);
    } catch (err) {
      console.error('Fetch notifications error', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkRead = async (id: string) => {
    try {
      await api.notifications.markRead(id);
      setNotifications(prev =>
        prev.map(n => (n._id === id ? { ...n, read: true } : n))
      );
    } catch (err) {
      console.error('Mark read error', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.notifications.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (err) {
      console.error('Mark all read error', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.notifications.delete(id);
      setNotifications(prev => prev.filter(n => n._id !== id));
    } catch (err) {
      console.error('Delete notification error', err);
    }
  };

  const filteredNotifications =
    filter === 'unread'
      ? notifications.filter(n => !n.read)
      : notifications;

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="animate-fade-in" style={{ position: 'relative' }}>
      <div className="glow-blur" />

      {/* Header */}
      <div className="header-bar">
        <div>
          <h1 className="page-title">Notification Center</h1>
          <p style={{ color: 'hsl(var(--text-secondary))', marginTop: '4px', fontSize: '0.95rem' }}>
            Stay informed about your posts, comments, workspace activity, and platform insights.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {unreadCount > 0 && (
            <button className="btn btn-secondary" onClick={handleMarkAllRead} style={{ fontSize: '0.8rem' }}>
              <CheckCheck size={14} />
              <span>Mark All Read</span>
            </button>
          )}
          <button className="btn btn-secondary" onClick={fetchNotifications} style={{ fontSize: '0.8rem' }}>
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        <button
          onClick={() => setFilter('all')}
          className={filter === 'all' ? 'btn btn-primary' : 'btn btn-secondary'}
          style={{ fontSize: '0.8rem' }}
        >
          <Bell size={14} />
          <span>All ({notifications.length})</span>
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={filter === 'unread' ? 'btn btn-primary' : 'btn btn-secondary'}
          style={{ fontSize: '0.8rem' }}
        >
          <AlertCircle size={14} />
          <span>Unread ({unreadCount})</span>
        </button>
      </div>

      {/* Notifications List */}
      {loading ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '60px 0',
            color: 'hsl(var(--text-muted))',
          }}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              border: '3px solid rgba(255,255,255,0.05)',
              borderTopColor: 'hsl(var(--primary))',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div
          className="glass-card"
          style={{
            padding: '60px 40px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <Bell size={40} style={{ color: 'hsl(var(--text-muted))' }} />
          <h3 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'hsl(var(--text-secondary))' }}>
            {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-muted))', maxWidth: '400px' }}>
            {filter === 'unread'
              ? 'You\'ve caught up! All notifications have been read.'
              : 'Notifications about your posts, comments, and account activity will appear here.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filteredNotifications.map((notification: any) => {
            const IconComponent =
              NOTIFICATION_ICONS[notification.type] || Bell;
            const accentColor =
              NOTIFICATION_COLORS[notification.type] || 'hsl(var(--primary))';

            return (
              <div
                key={notification._id}
                className="glass-card"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '14px',
                  padding: '16px 20px',
                  borderLeft: `3px solid ${notification.read ? 'transparent' : accentColor}`,
                  opacity: notification.read ? 0.7 : 1,
                  transition: 'all 0.2s ease',
                }}
              >
                {/* Icon */}
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: 'var(--radius-md)',
                    background: `${accentColor}15`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <IconComponent size={16} style={{ color: accentColor }} />
                </div>

                {/* Content */}
                <div style={{ flexGrow: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '12px',
                    }}
                  >
                    <div>
                      <span
                        style={{
                          fontSize: '0.9rem',
                          fontWeight: notification.read ? 400 : 600,
                          color: 'white',
                        }}
                      >
                        {notification.title}
                      </span>
                      {!notification.read && (
                        <span
                          style={{
                            display: 'inline-block',
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: accentColor,
                            marginLeft: '8px',
                            verticalAlign: 'middle',
                          }}
                        />
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        color: 'hsl(var(--text-muted))',
                        whiteSpace: 'nowrap',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        flexShrink: 0,
                      }}
                    >
                      <Clock size={10} />
                      {formatTimestamp(notification.createdAt)}
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: '0.8rem',
                      color: 'hsl(var(--text-secondary))',
                      marginTop: '4px',
                      lineHeight: '1.4',
                    }}
                  >
                    {notification.message}
                  </p>

                  {/* Actions */}
                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      marginTop: '10px',
                    }}
                  >
                    {!notification.read && (
                      <button
                        onClick={() => handleMarkRead(notification._id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 10px',
                          fontSize: '0.7rem',
                          background: 'rgba(16, 185, 129, 0.1)',
                          color: '#10b981',
                          border: '1px solid rgba(16, 185, 129, 0.2)',
                          borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer',
                          fontFamily: 'var(--font-sans)',
                          fontWeight: 500,
                          transition: 'all 0.15s ease',
                        }}
                        className="action-hover-green"
                      >
                        <CheckCircle2 size={11} />
                        <span>Mark Read</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(notification._id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 10px',
                        fontSize: '0.7rem',
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: '#ef4444',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-sans)',
                        fontWeight: 500,
                        transition: 'all 0.15s ease',
                      }}
                      className="action-hover-red"
                    >
                      <Trash2 size={11} />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .action-hover-green:hover {
          background: rgba(16, 185, 129, 0.2) !important;
        }
        .action-hover-red:hover {
          background: rgba(239, 68, 68, 0.2) !important;
        }
      `}</style>
    </div>
  );
};

export default NotificationCenter;