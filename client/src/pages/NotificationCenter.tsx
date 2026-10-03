import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../services/api';
import {
  Bell,
  FileText,
  MessageSquare,
  Users,
  Settings,
  Calendar,
  ChevronDown,
  Check,
  Trash2,
  AlertCircle,
  CreditCard,
  TrendingUp,
  Send
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
  const [filter, setFilter] = useState<'all' | 'posts' | 'comments' | 'workspace' | 'system'>('all');
  const [timeFilter, setTimeFilter] = useState('All Time');
  const [showTimeMenu, setShowTimeMenu] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const list = await api.notifications.list();
      setNotifications(list || []);
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

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'posts') return n.type === 'post_published' || n.type === 'post_failed';
    if (filter === 'comments') return n.type === 'new_comment';
    if (filter === 'workspace') return n.type === 'workspace_invite';
    if (filter === 'system') return n.type === 'subscription_update' || n.type === 'analytics_alert';
    return true;
  });

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      
      {/* 1. Header Banner with Ceramic Bell & Olive Branch Watermark */}
      <div style={{
        position: 'relative',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 18px',
        borderRadius: '16px',
        overflow: 'hidden',
        minHeight: '140px'
      }}>
        {/* Ceramic Bell Graphic on the right */}
        <div style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: '55%',
          height: '100%',
          backgroundImage: "url('/notification-bell-scene.png')",
          backgroundPosition: 'right center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'contain',
          pointerEvents: 'none'
        }} />

        {/* Left Heading */}
        <div style={{ position: 'relative', zIndex: 2, maxWidth: '580px' }}>
          <div style={{
            fontSize: '0.6875rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: '#6b7280',
            textTransform: 'uppercase',
            marginBottom: '3px'
          }}>
            NOTIFICATIONS
          </div>
          <h1 style={{
            fontSize: '2.35rem',
            fontWeight: 700,
            color: '#111827',
            letterSpacing: '-0.025em',
            marginBottom: '4px',
            lineHeight: 1.15
          }}>
            Notification Center
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.4 }}>
            Stay informed about your posts, comments, workspace activity, and platform insights.
          </p>
        </div>
      </div>

      {/* 2. Category Filter & Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        
        {/* Left Category Filter Pills */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* All */}
          <button
            type="button"
            onClick={() => setFilter('all')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '7px 18px',
              background: filter === 'all' ? '#18181b' : '#ffffff',
              color: filter === 'all' ? '#ffffff' : '#374151',
              border: filter === 'all' ? 'none' : '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '0.825rem',
              fontWeight: filter === 'all' ? 600 : 500,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)',
              transition: 'all 0.15s ease'
            }}
          >
            <Bell size={14} style={{ color: filter === 'all' ? '#ffffff' : '#6b7280' }} />
            <span>All</span>
          </button>

          {/* Posts */}
          <button
            type="button"
            onClick={() => setFilter('posts')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              background: filter === 'posts' ? '#e5e1dc' : '#ffffff',
              color: '#374151',
              border: filter === 'posts' ? 'none' : '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '0.825rem',
              fontWeight: filter === 'posts' ? 600 : 500,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
            }}
          >
            <FileText size={14} style={{ color: '#6b7280' }} />
            <span>Posts</span>
          </button>

          {/* Comments */}
          <button
            type="button"
            onClick={() => setFilter('comments')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              background: filter === 'comments' ? '#e5e1dc' : '#ffffff',
              color: '#374151',
              border: filter === 'comments' ? 'none' : '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '0.825rem',
              fontWeight: filter === 'comments' ? 600 : 500,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
            }}
          >
            <MessageSquare size={14} style={{ color: '#6b7280' }} />
            <span>Comments</span>
          </button>

          {/* Workspace */}
          <button
            type="button"
            onClick={() => setFilter('workspace')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              background: filter === 'workspace' ? '#e5e1dc' : '#ffffff',
              color: '#374151',
              border: filter === 'workspace' ? 'none' : '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '0.825rem',
              fontWeight: filter === 'workspace' ? 600 : 500,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
            }}
          >
            <Users size={14} style={{ color: '#6b7280' }} />
            <span>Workspace</span>
          </button>

          {/* System */}
          <button
            type="button"
            onClick={() => setFilter('system')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              background: filter === 'system' ? '#e5e1dc' : '#ffffff',
              color: '#374151',
              border: filter === 'system' ? 'none' : '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '0.825rem',
              fontWeight: filter === 'system' ? 600 : 500,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
            }}
          >
            <Settings size={14} style={{ color: '#6b7280' }} />
            <span>System</span>
          </button>
        </div>

        {/* Right Time Range & Mark Read Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          
          {/* Time Range Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setShowTimeMenu(!showTimeMenu)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                height: '36px',
                padding: '0 14px',
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '0.825rem',
                fontWeight: 500,
                color: '#374151',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
              }}
            >
              <Calendar size={14} style={{ color: '#6b7280' }} />
              <span>{timeFilter}</span>
              <ChevronDown size={14} style={{ color: '#9ca3af' }} />
            </button>

            {showTimeMenu && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                right: 0,
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
                zIndex: 30,
                minWidth: '130px',
                padding: '4px'
              }}>
                {['All Time', 'Today', 'This Week', 'This Month'].map(tf => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => {
                      setTimeFilter(tf);
                      setShowTimeMenu(false);
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '7px 12px',
                      background: timeFilter === tf ? '#f3f4f6' : 'transparent',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      color: '#111827',
                      cursor: 'pointer'
                    }}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Mark all as read Button */}
          <button
            type="button"
            onClick={handleMarkAllRead}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              height: '36px',
              padding: '0 14px',
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '0.825rem',
              fontWeight: 500,
              color: '#374151',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
            }}
          >
            <Check size={14} style={{ color: '#111827' }} />
            <span>Mark all as read</span>
          </button>
        </div>
      </div>

      {/* 3. Main Center Card with Empty or Populated State */}
      <div className="card" style={{ padding: '28px', minHeight: '460px', display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div style={{ display: 'flex', flexGrow: 1, alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '0.875rem' }}>
            Loading alerts...
          </div>
        ) : filteredNotifications.length === 0 ? (
          /* Exact 100% Empty State matching the screenshot */
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flexGrow: 1,
            padding: '50px 20px 60px'
          }}>
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: '#f5efe6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px'
            }}>
              <Bell size={34} style={{ color: '#8c7355', strokeWidth: 1.8 }} />
            </div>

            <h3 style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              color: '#111827',
              marginBottom: '6px'
            }}>
              No notifications yet
            </h3>

            <p style={{
              fontSize: '0.85rem',
              color: '#6b7280',
              textAlign: 'center',
              maxWidth: '420px',
              lineHeight: 1.5,
              marginBottom: '22px'
            }}>
              You’ll see updates here about your posts, comments, workspace activity, and important alerts.
            </p>

            <button
              type="button"
              onClick={() => alert('Browser notifications enabled for your workspace.')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                background: '#18181b',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
              }}
            >
              <Bell size={15} />
              <span>Enable Notifications</span>
            </button>
          </div>
        ) : (
          /* Populated Notification Stream */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredNotifications.map((notification: any) => {
              const IconComponent = NOTIFICATION_ICONS[notification.type] || Bell;
              const accentColor = NOTIFICATION_COLORS[notification.type] || '#18181b';

              return (
                <div
                  key={notification._id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '14px',
                    padding: '14px 18px',
                    background: notification.read ? '#ffffff' : '#fafaf9',
                    border: '1px solid #e5e7eb',
                    borderRadius: '10px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexGrow: 1 }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      background: `${accentColor}15`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <IconComponent size={16} style={{ color: accentColor }} />
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: notification.read ? 500 : 700, color: '#111827' }}>
                          {notification.title}
                        </span>
                        {!notification.read && (
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4f47ee' }} />
                        )}
                      </div>
                      <p style={{ fontSize: '0.825rem', color: '#6b7280', margin: 0 }}>
                        {notification.message}
                      </p>
                      <span style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '4px', display: 'inline-block' }}>
                        {formatTimestamp(notification.createdAt)}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {!notification.read && (
                      <button
                        type="button"
                        onClick={() => handleMarkRead(notification._id)}
                        className="btn btn-secondary"
                        style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                        title="Mark read"
                      >
                        <Check size={13} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(notification._id)}
                      className="btn btn-secondary"
                      style={{ padding: '6px 10px', fontSize: '0.75rem', color: '#ef4444' }}
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Bottom 4 Feature Cards (Row of 4) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '16px'
      }} className="responsive-stat-grid">
        
        {/* Card 1: Post Updates */}
        <div className="card" style={{ padding: '18px 20px', display: 'flex', gap: '14px', alignItems: 'center' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: '#f4f4f5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <FileText size={18} style={{ color: '#111827' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827' }}>Post Updates</div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '2px' }}>
              Publishing status, failures, and performance insights.
            </div>
          </div>
        </div>

        {/* Card 2: Comment Activity */}
        <div className="card" style={{ padding: '18px 20px', display: 'flex', gap: '14px', alignItems: 'center' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: '#f4f4f5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <MessageSquare size={18} style={{ color: '#111827' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827' }}>Comment Activity</div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '2px' }}>
              New comments and replies across your channels.
            </div>
          </div>
        </div>

        {/* Card 3: Workspace Activity */}
        <div className="card" style={{ padding: '18px 20px', display: 'flex', gap: '14px', alignItems: 'center' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: '#f4f4f5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Users size={18} style={{ color: '#111827' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827' }}>Workspace Activity</div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '2px' }}>
              Team actions, approvals, and workspace changes.
            </div>
          </div>
        </div>

        {/* Card 4: System Alerts */}
        <div className="card" style={{ padding: '18px 20px', display: 'flex', gap: '14px', alignItems: 'center' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: '#f4f4f5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Settings size={18} style={{ color: '#111827' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827' }}>System Alerts</div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '2px' }}>
              Important updates and platform notifications.
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
