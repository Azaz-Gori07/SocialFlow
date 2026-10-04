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
  BellDot, 
  X, 
  FileText, 
  GitBranch, 
  ChevronRight, 
  User, 
  Link2 
} from 'lucide-react';
import { onNotification, onUnreadCount } from '../services/socket';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  isOpen?: boolean;
  setIsOpen?: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, setCurrentTab, isOpen, setIsOpen }) => {
  const { user, workspace, workspaces, switchWorkspace, logout } = useAuth();
  const [, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showWSMenu, setShowWSMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [developerEnabled, setDeveloperEnabled] = useState(false);

  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    api.developer
      .status()
      .then(res => {
        if (!cancelled) setDeveloperEnabled(res?.enabled === true);
      })
      .catch(err => {
        console.error('Developer status check failed', err);
        if (!cancelled) setDeveloperEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    
    const fetchNotifications = async () => {
      try {
        const list = await api.notifications.list();
        setNotifications(list);
        setUnreadCount(list.filter((n: any) => !n.read).length);
      } catch (err) {
        console.error('Fetch notifications error', err);
      }
    };

    fetchNotifications();

    const unsubNotification = onNotification((notification) => {
      setNotifications(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);
    });

    const unsubUnreadCount = onUnreadCount((data) => {
      setUnreadCount(data.count);
      if (data.count === 0) {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      }
    });

    return () => {
      unsubNotification();
      unsubUnreadCount();
    };
  }, [userId]);

  const navSections = [
    {
      title: 'PLATFORM',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'studio', label: 'AI Studio', icon: Sparkles },
        { id: 'scheduler', label: 'Scheduler', icon: Calendar },
        { id: 'drafts', label: 'Drafts', icon: FileText },
        { id: 'comments', label: 'Comments', icon: MessageSquare },
      ]
    },
    {
      title: 'GROWTH & OPS',
      items: [
        { id: 'analytics', label: 'Analytics', icon: BarChart3 },
        { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadCount },
        { id: 'workspaces', label: 'Workspaces', icon: Users },
        ...(developerEnabled ? [{ id: 'developer', label: 'Developer', icon: GitBranch }] : []),
      ]
    },
    {
      title: 'PREFERENCES',
      items: [
        { id: 'notification-preferences', label: 'Alert Rules', icon: BellDot },
        { id: 'connected-accounts', label: 'Connected Accounts', icon: Link2 },
        { id: 'settings', label: 'Settings', icon: Settings },
      ]
    }
  ];

  const userInitial = user?.fullName ? user.fullName[0].toUpperCase() : 'A';
  const workspaceDisplayName = workspace?.name || (user?.fullName ? `${user.fullName}'s Workspace` : "azaz's Workspace");

  return (
    <aside className={`sidebar-wrapper ${isOpen ? 'open' : ''}`}>
      {/* Brand Header */}
      <div style={{
        padding: '24px 22px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
          <div style={{
            background: '#18181b',
            borderRadius: '9px',
            padding: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.12)'
          }}>
            <Layers size={19} color="#ffffff" />
          </div>
          <span style={{
            fontFamily: "'Outfit', var(--font-display), sans-serif",
            fontWeight: 700,
            fontSize: '1.25rem',
            letterSpacing: '-0.025em',
            color: '#111827',
            lineHeight: 1
          }}>
            SocialFlow
          </span>
        </div>

        {setIsOpen && (
          <button
            onClick={() => setIsOpen(false)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#6b7280',
              cursor: 'pointer',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '6px'
            }}
            className="sidebar-close-btn"
            title="Close menu"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Workspace Selector Dropdown Box */}
      <div style={{ padding: '6px 16px 18px', position: 'relative' }}>
        <button 
          onClick={() => setShowWSMenu(!showWSMenu)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '10px',
            color: '#111827',
            cursor: 'pointer',
            textAlign: 'left',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = '#d1d5db')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = '#e5e7eb')}
        >
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <span style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', fontWeight: 600, marginBottom: '2px' }}>
              WORKSPACE
            </span>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {workspaceDisplayName}
            </span>
          </div>
          <ChevronDown size={14} style={{ color: '#9ca3af', transform: showWSMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
        </button>

        {showWSMenu && (
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: '16px',
            right: '16px',
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '4px',
            zIndex: 50,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)'
          }}>
            {workspaces.map((w: any) => (
              <button
                key={w.id}
                onClick={() => {
                  switchWorkspace(w.id);
                  setShowWSMenu(false);
                }}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  background: w.id === workspace?.id ? '#f3f4f6' : 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#111827',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.825rem'
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
                <span style={{ fontSize: '0.62rem', padding: '1px 5px', background: '#f3f4f6', borderRadius: '3px', textTransform: 'uppercase', color: '#6b7280' }}>
                  {w.role}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Navigation List */}
      <nav style={{ flexGrow: 1, padding: '4px 14px', display: 'flex', flexDirection: 'column', gap: '22px', overflowY: 'auto' }}>
        {navSections.map((section, idx) => (
          <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{
              padding: '0 10px 6px',
              fontSize: '0.65rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: '#9ca3af',
              textTransform: 'uppercase'
            }}>
              {section.title}
            </span>
            {section.items.map(item => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentTab(item.id);
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '9px 12px',
                    background: isActive ? '#edeef0' : 'transparent',
                    border: 'none',
                    borderRadius: '8px',
                    color: isActive ? '#111827' : '#4b5563',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '0.875rem',
                    fontWeight: isActive ? 600 : 500,
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => {
                    if (!isActive) {
                      e.currentTarget.style.background = '#f4f4f5';
                      e.currentTarget.style.color = '#111827';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#4b5563';
                    }
                  }}
                >
                  <Icon size={17} style={{ color: isActive ? '#111827' : '#6b7280', flexShrink: 0 }} />
                  <span style={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <span style={{
                      background: '#ef4444',
                      color: 'white',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      padding: '1px 5px',
                      borderRadius: '9999px',
                      minWidth: '16px',
                      textAlign: 'center'
                    }}>
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* System Status Pill Card */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '10px',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        margin: '12px 16px 14px',
        cursor: 'pointer',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px rgba(16, 185, 129, 0.4)' }} />
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827', lineHeight: 1.2 }}>System Status</div>
            <div style={{ fontSize: '0.68rem', color: '#6b7280' }}>All systems operational</div>
          </div>
        </div>
        <ChevronRight size={14} color="#9ca3af" />
      </div>

      {/* User Session Footer with Settings Gear Popover Menu */}
      <div style={{
        position: 'relative',
        padding: '14px 18px 18px',
        borderTop: '1px solid #e7e5e0',
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }}>
        {/* Floating User Account Popover Menu */}
        {showUserMenu && (
          <div style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: '14px',
            right: '14px',
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            boxShadow: '0 12px 30px -4px rgba(0, 0, 0, 0.12), 0 4px 10px -2px rgba(0, 0, 0, 0.05)',
            zIndex: 60,
            padding: '6px',
            animation: 'modalPop 0.18s var(--ease-out-expo)'
          }}>
            {/* User Header Summary in Popover */}
            <div style={{
              padding: '8px 10px 10px',
              borderBottom: '1px solid #f3f4f6',
              marginBottom: '4px'
            }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827' }}>
                {user?.fullName || 'azaz'}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>
                {user?.email || 'azazgori76@gmail.com'}
              </div>
            </div>

            {/* Profile Action */}
            <button
              type="button"
              onClick={() => {
                setCurrentTab('profile');
                setShowUserMenu(false);
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 10px',
                background: currentTab === 'profile' ? '#f3f4f6' : 'transparent',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.825rem',
                fontWeight: currentTab === 'profile' ? 600 : 500,
                color: '#111827',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.15s ease'
              }}
              onMouseEnter={e => {
                if (currentTab !== 'profile') e.currentTarget.style.background = '#f9fafb';
              }}
              onMouseLeave={e => {
                if (currentTab !== 'profile') e.currentTarget.style.background = 'transparent';
              }}
            >
              <User size={15} style={{ color: '#4b5563' }} />
              <span>Profile</span>
            </button>

            {/* Settings Action */}
            <button
              type="button"
              onClick={() => {
                setCurrentTab('settings');
                setShowUserMenu(false);
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 10px',
                background: currentTab === 'settings' ? '#f3f4f6' : 'transparent',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.825rem',
                fontWeight: currentTab === 'settings' ? 600 : 500,
                color: '#111827',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.15s ease'
              }}
              onMouseEnter={e => {
                if (currentTab !== 'settings') e.currentTarget.style.background = '#f9fafb';
              }}
              onMouseLeave={e => {
                if (currentTab !== 'settings') e.currentTarget.style.background = 'transparent';
              }}
            >
              <Settings size={15} style={{ color: '#4b5563' }} />
              <span>Settings</span>
            </button>

            {/* Divider */}
            <div style={{ height: '1px', background: '#f3f4f6', margin: '4px 0' }} />

            {/* Log Out Action */}
            <button
              type="button"
              onClick={() => {
                setShowUserMenu(false);
                logout();
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 10px',
                background: 'transparent',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.825rem',
                fontWeight: 500,
                color: '#ef4444',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.15s ease'
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <LogOut size={15} style={{ color: '#ef4444' }} />
              <span>Log Out</span>
            </button>
          </div>
        )}

        <div style={{
          width: '34px',
          height: '34px',
          borderRadius: '50%',
          background: '#ef4444',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 600,
          fontSize: '0.85rem',
          flexShrink: 0
        }}>
          {userInitial}
        </div>
        <div 
          onClick={() => setShowUserMenu(!showUserMenu)}
          style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', cursor: 'pointer' }}
        >
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
            {user?.fullName || 'azaz'}
          </span>
          <span style={{ fontSize: '0.72rem', color: '#9ca3af', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
            {user?.email || 'azazgori76@gmail.com'}
          </span>
        </div>
        
        {/* Settings Gear Icon Button (Enlarged 20px) */}
        <button 
          onClick={() => setShowUserMenu(!showUserMenu)}
          style={{
            background: showUserMenu ? '#f3f4f6' : 'none',
            border: 'none',
            color: showUserMenu ? '#111827' : '#4b5563',
            cursor: 'pointer',
            padding: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '8px',
            transition: 'all 0.15s ease'
          }}
          title="Account Menu"
          onMouseEnter={e => {
            e.currentTarget.style.background = '#f3f4f6';
            e.currentTarget.style.color = '#111827';
          }}
          onMouseLeave={e => {
            if (!showUserMenu) {
              e.currentTarget.style.background = 'none';
              e.currentTarget.style.color = '#4b5563';
            }
          }}
        >
          <Settings size={20} />
        </button>
      </div>

      <style>{`
        .sidebar-close-btn {
          display: none !important;
        }
        @media (max-width: 1024px) {
          .sidebar-close-btn {
            display: flex !important;
          }
        }
      `}</style>
    </aside>
  );
};

export default Sidebar;
