import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { 
  LayoutDashboard, 
  Sparkles, 
  Calendar, 
  MessageSquare, 
  BarChart3, 
  Users, 
  Settings, 
  LogOut,
  Bell,
  ChevronDown,
  Layers,
  BellDot
} from 'lucide-react';
import { onNotification, onUnreadCount } from '../services/socket';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, setCurrentTab }) => {
  const { user, workspace, workspaces, switchWorkspace, logout } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showWSMenu, setShowWSMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  // Initial fetch and real-time socket subscriptions
  useEffect(() => {
    if (!user) return;
    
    const fetchNotifications = async () => {
      try {
        const list = await api.notifications.list();
        setNotifications(list);
        setUnreadCount(list.filter((n: any) => !n.read).length);
      } catch (err) {
        console.error('Fetch notifications error', err);
      }
    };

    // Initial fetch
    fetchNotifications();

    // Subscribe to real-time notifications via Socket.IO
    const unsubNotification = onNotification((notification) => {
      setNotifications(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);
    });

    // Subscribe to unread count updates
    const unsubUnreadCount = onUnreadCount((data) => {
      // When count is 0, it's a mark-all-read signal
      setUnreadCount(data.count);
      if (data.count === 0) {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      }
    });

    return () => {
      unsubNotification();
      unsubUnreadCount();
    };
  }, [user]);

  const handleMarkRead = async () => {
    try {
      await api.notifications.markAllRead();
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (err) {
      console.error(err);
    }
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'studio', label: 'AI Content Studio', icon: Sparkles },
    { id: 'scheduler', label: 'Post Scheduler', icon: Calendar },
    { id: 'comments', label: 'Comment Inbox', icon: MessageSquare },
    { id: 'notifications', label: 'Notification Center', icon: Bell, badge: unreadCount },
    { id: 'analytics', label: 'Analytics Hub', icon: BarChart3 },
    { id: 'workspaces', label: 'Collaboration', icon: Users },
    { id: 'notification-preferences', label: 'Prefs & Alerts', icon: BellDot },
    { id: 'settings', label: 'Connected Accounts', icon: Settings },
  ];

  return (
    <aside className="sidebar-wrapper">
      {/* Brand Logo */}
      <div style={{ padding: '24px 20px', borderBottom: '1px solid hsl(var(--border))', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), #00F2FE)', borderRadius: '8px', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Layers size={20} color="white" />
        </div>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-0.02em', background: 'linear-gradient(135deg, #fff, hsl(var(--text-secondary)))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          SocialFlow AI
        </span>
      </div>

      {/* Workspace Selector */}
      {workspace && (
        <div style={{ padding: '16px 20px', position: 'relative' }}>
          <button 
            onClick={() => setShowWSMenu(!showWSMenu)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255, 255, 255, 0.04)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-md)', color: 'white', cursor: 'pointer', textAlign: 'left' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--text-muted))' }}>Active Workspace</span>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{workspace.name}</span>
            </div>
            <ChevronDown size={16} style={{ color: 'hsl(var(--text-muted))', transform: showWSMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>

          {showWSMenu && (
            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: '20px', right: '20px', background: 'hsl(var(--bg-card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius-md)', padding: '6px', zIndex: 50, boxShadow: 'var(--shadow-lg)' }}>
              {workspaces.map((w: any) => (
                <button
                  key={w.id}
                  onClick={() => {
                    switchWorkspace(w.id);
                    setShowWSMenu(false);
                  }}
                  style={{ width: '100%', padding: '8px 12px', background: w.id === workspace.id ? 'hsl(var(--bg-card-hover))' : 'transparent', border: 'none', borderRadius: 'var(--radius-sm)', color: 'white', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}
                >
                  <span>{w.name}</span>
                  <span style={{ fontSize: '0.65rem', padding: '2px 6px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', textTransform: 'uppercase', color: 'hsl(var(--text-secondary))' }}>
                    {w.role}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Navigation List */}
      <nav style={{ flexGrow: 1, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setCurrentTab(item.id);
                setShowNotifications(false);
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 14px',
                background: isActive ? 'linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--primary) / 0.05))' : 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                color: isActive ? 'white' : 'hsl(var(--text-secondary))',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'var(--font-sans)',
                fontSize: '0.9rem',
                fontWeight: isActive ? 500 : 400,
                transition: 'all 0.2s ease',
                position: 'relative'
              }}
              className={isActive ? '' : 'sidebar-btn-hover'}
            >
              <Icon size={18} style={{ color: isActive ? 'hsl(var(--primary))' : 'hsl(var(--text-secondary))' }} />
              <span style={{ flexGrow: 1 }}>{item.label}</span>
              {typeof item.badge === 'number' && item.badge > 0 && (
                <span style={{ background: '#ef4444', color: 'white', fontSize: '0.7rem', fontWeight: 700, padding: '2px 6px', borderRadius: '99px', minWidth: '18px', textAlign: 'center' }}>
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Notification Bell Panel */}
      <div style={{ padding: '0 20px', position: 'relative' }}>
        <button
          onClick={() => {
            setShowNotifications(!showNotifications);
            if (!showNotifications) handleMarkRead();
          }}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: 'transparent', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-md)', color: 'hsl(var(--text-secondary))', cursor: 'pointer', fontSize: '0.85rem' }}
        >
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Bell size={16} />
            {unreadCount > 0 && (
              <span style={{ position: 'absolute', top: '-4px', right: '-4px', width: '8px', height: '8px', background: '#ef4444', borderRadius: '50%' }} />
            )}
          </div>
          <span style={{ flexGrow: 1, textAlign: 'left' }}>System Alerts</span>
          <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>{notifications.length} total</span>
        </button>

        {showNotifications && (
          <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: '20px', right: '20px', background: 'hsl(var(--bg-card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius-md)', padding: '10px', zIndex: 60, boxShadow: 'var(--shadow-lg)', maxHeight: '250px', overflowY: 'auto' }}>
            <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--text-muted))', marginBottom: '8px', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '4px' }}>Alert Logs</h4>
            {notifications.length === 0 ? (
              <p style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', padding: '8px 0', textAlign: 'center' }}>No new notifications</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {notifications.slice(0, 5).map((n: any) => (
                  <div key={n._id} style={{ fontSize: '0.75rem', padding: '6px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', borderLeft: `2px solid ${n.type === 'post_failed' ? '#ef4444' : 'hsl(var(--primary))'}` }}>
                    <div style={{ fontWeight: 600, color: 'white' }}>{n.title}</div>
                    <div style={{ color: 'hsl(var(--text-secondary))' }}>{n.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* User Session Info */}
      {user && (
        <div style={{ padding: '20px', borderTop: '1px solid hsl(var(--border))', display: 'flex', alignItems: 'center', justifyItems: 'space-between', gap: '12px' }}>
          <img src={user.avatarUrl} alt={user.fullName} style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)' }} />
          <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'white', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{user.fullName}</span>
            <span style={{ fontSize: '0.7rem', color: 'hsl(var(--text-muted))', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{user.email}</span>
          </div>
          <button 
            onClick={logout}
            style={{ background: 'none', border: 'none', color: 'hsl(var(--text-muted))', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
            title="Log Out"
            className="logout-hover"
          >
            <LogOut size={16} />
          </button>
        </div>
      )}

      {/* Hover styling helper */}
      <style>{`
        .sidebar-btn-hover:hover {
          background: rgba(255, 255, 255, 0.03) !important;
          color: white !important;
        }
        .logout-hover:hover {
          color: #ef4444 !important;
        }
      `}</style>
    </aside>
  );
};
