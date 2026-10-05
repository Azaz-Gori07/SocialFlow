import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Sidebar } from './components/Sidebar';
import { BootScreen } from './components/BootScreen';
import { GenericSkeleton } from './components/Skeleton';
import { Suspense } from 'react';
// Pages are route/tab-level code split: the shell paints first and each
// page chunk streams in on navigation instead of shipping everything in the
// initial bundle.
const Auth = React.lazy(() => import('./pages/Auth').then(m => ({ default: m.Auth })));
const Dashboard = React.lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const ContentStudio = React.lazy(() => import('./pages/ContentStudio').then(m => ({ default: m.ContentStudio })));
const Scheduler = React.lazy(() => import('./pages/Scheduler').then(m => ({ default: m.Scheduler })));
const Comments = React.lazy(() => import('./pages/Comments').then(m => ({ default: m.Comments })));
const Analytics = React.lazy(() => import('./pages/Analytics').then(m => ({ default: m.Analytics })));
const Workspaces = React.lazy(() => import('./pages/Workspaces').then(m => ({ default: m.Workspaces })));
const Settings = React.lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const ConnectedAccounts = React.lazy(() => import('./pages/ConnectedAccounts').then(m => ({ default: m.ConnectedAccounts })));
const NotificationCenter = React.lazy(() => import('./pages/NotificationCenter').then(m => ({ default: m.NotificationCenter })));
const NotificationPreferences = React.lazy(() => import('./pages/NotificationPreferences').then(m => ({ default: m.NotificationPreferences })));
const AuthCallback = React.lazy(() => import('./pages/AuthCallback').then(m => ({ default: m.AuthCallback })));
const DeveloperGitHubCallback = React.lazy(() => import('./pages/developer/DeveloperGitHubCallback').then(m => ({ default: m.DeveloperGitHubCallback })));
const DeveloperShell = React.lazy(() => import('./pages/developer/DeveloperShell').then(m => ({ default: m.DeveloperShell })));
const DraftLibrary = React.lazy(() => import('./pages/DraftLibrary').then(m => ({ default: m.DraftLibrary })));
const Profile = React.lazy(() => import('./pages/Profile').then(m => ({ default: m.Profile })));
import { 
  Menu, 
  Layers, 
  Search, 
  Plus, 
  LayoutDashboard, 
  Sparkles, 
  Calendar, 
  FileText, 
  MessageSquare, 
  BarChart3, 
  Users, 
  Settings as SettingsIcon,
  X,
  Sun,
  Bell,
  Link2
} from 'lucide-react';

const VALID_TABS = [
  'dashboard',
  'studio',
  'scheduler',
  'drafts',
  'comments',
  'notifications',
  'notification-preferences',
  'analytics',
  'workspaces',
  'developer',
  'profile',
  'settings',
  'connected-accounts'
];

const COMMAND_ITEMS = [
  { id: 'dashboard', label: 'Go to Unified Dashboard', icon: LayoutDashboard, category: 'Navigation' },
  { id: 'studio', label: 'Open AI Content Studio', icon: Sparkles, category: 'Actions' },
  { id: 'scheduler', label: 'View Post Scheduler & Queue', icon: Calendar, category: 'Navigation' },
  { id: 'drafts', label: 'Browse Draft Library', icon: FileText, category: 'Navigation' },
  { id: 'comments', label: 'Review Comment Inbox', icon: MessageSquare, category: 'Actions' },
  { id: 'analytics', label: 'Open Analytics Hub & Reports', icon: BarChart3, category: 'Navigation' },
  { id: 'workspaces', label: 'Manage Team & Workspaces', icon: Users, category: 'Settings' },
  { id: 'profile', label: 'My Profile & Account Security', icon: Users, category: 'Account' },
  { id: 'connected-accounts', label: 'Connected OAuth Accounts', icon: Link2, category: 'Channels' },
  { id: 'settings', label: 'Application & Workspace Settings', icon: SettingsIcon, category: 'Settings' }
];

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const pathSegment = location.pathname.replace(/^\//, '').split('/')[0];
  const currentTab = VALID_TABS.includes(pathSegment) ? pathSegment : 'dashboard';

  const setCurrentTab = (tab: string) => {
    navigate(`/${tab}`);
    setIsSidebarOpen(false);
  };

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [bootDone, setBootDone] = useState(false);

  useEffect(() => {
    document.documentElement.removeAttribute('data-theme');
    localStorage.removeItem('socialflow-theme');
  }, []);

  // Global ⌘K / Ctrl+K keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setIsCommandOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Boot curtain overlays the real view (already rendered underneath) and
  // wipes up once auth hydrates — it never gates rendering on the network.
  const boot = !bootDone ? (
    <BootScreen ready={!loading} onDone={() => setBootDone(true)} />
  ) : null;

  // If user is not authenticated, render Auth login/register view
  if (!user) {
    return (
      <>
        {boot}
        <Suspense fallback={<GenericSkeleton />}>
          <Auth />
        </Suspense>
      </>
    );
  }

  const filteredCommands = COMMAND_ITEMS.filter(item =>
    item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Render Page Content based on selected sidebar tab
  const renderActivePage = () => {
    switch (currentTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'studio':
        return <ContentStudio />;
      case 'scheduler':
        return <Scheduler />;
      case 'comments':
        return <Comments />;
      case 'analytics':
        return <Analytics />;
      case 'workspaces':
        return <Workspaces />;
      case 'notifications':
        return <NotificationCenter />;
      case 'notification-preferences':
        return <NotificationPreferences />;
      case 'drafts':
        return <DraftLibrary />;
      case 'developer':
        return <DeveloperShell />;
      case 'profile':
        return <Profile />;
      case 'connected-accounts':
        return <ConnectedAccounts />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <>
      {boot}
      <div className="app-container">
      {/* Mobile Top Bar */}
      <header className="mobile-header-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            background: '#18181b',
            borderRadius: '6px',
            padding: '5px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Layers size={15} color="white" />
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.05rem', color: '#111827', letterSpacing: '-0.02em' }}>
            SocialFlow
          </span>
        </div>
        <button 
          className="mobile-menu-btn" 
          onClick={() => setIsSidebarOpen(true)}
          title="Open Menu"
        >
          <Menu size={18} />
        </button>
      </header>

      {/* Sidebar Backdrop Overlay */}
      <div 
        className={`sidebar-backdrop ${isSidebarOpen ? 'show' : ''}`}
        onClick={() => setIsSidebarOpen(false)}
      />

      {/* Navigation Sidebar */}
      <Sidebar 
        currentTab={currentTab} 
        setCurrentTab={(tab) => {
          setCurrentTab(tab);
          setIsSidebarOpen(false);
        }} 
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
      />
      
      {/* Main Workspace Frame */}
      <div className="main-stage-container">
        {/* Desktop Top Command Bar */}
        <header className="desktop-command-bar">
          {/* Centered Search Bar */}
          <div 
            onClick={() => setIsCommandOpen(true)}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '480px',
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer'
            }}
          >
            <Search size={14} style={{ position: 'absolute', left: '13px', color: '#9ca3af' }} />
            <input
              type="text"
              readOnly
              placeholder="Search posts, drafts, accounts, or anything..."
              style={{
                width: '100%',
                height: '38px',
                paddingLeft: '36px',
                paddingRight: '50px',
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '10px',
                fontSize: '0.825rem',
                color: '#111827',
                cursor: 'pointer',
                outline: 'none',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
              }}
            />
            <div style={{
              position: 'absolute',
              right: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              padding: '2px 6px',
              background: '#f3f4f6',
              border: '1px solid #e5e7eb',
              borderRadius: '5px',
              fontSize: '0.68rem',
              color: '#6b7280',
              fontWeight: 600
            }}>
              ⌘ K
            </div>
          </div>

          {/* Right Header Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              style={{
                background: 'none',
                border: 'none',
                color: '#4b5563',
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                borderRadius: '6px'
              }}
              title="Theme"
            >
              <Sun size={17} />
            </button>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <button
                onClick={() => setCurrentTab('notifications')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#4b5563',
                  cursor: 'pointer',
                  padding: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: '6px'
                }}
                title="Notifications"
              >
                <Bell size={17} />
              </button>
              <span style={{
                position: 'absolute',
                top: '5px',
                right: '5px',
                width: '6px',
                height: '6px',
                background: '#ef4444',
                borderRadius: '50%',
                border: '1.5px solid #ffffff'
              }} />
            </div>
            <button
              onClick={() => setCurrentTab('studio')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
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
              <Plus size={14} />
              <span>New Draft</span>
            </button>
          </div>
        </header>

        {/* Active Page View */}
        <main className="content-wrapper">
          <Suspense fallback={<GenericSkeleton />}>
            {renderActivePage()}
          </Suspense>
        </main>
      </div>

      {/* Raycast-style ⌘K Command Palette Modal */}
      {isCommandOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingTop: '12vh',
          zIndex: 999
        }} onClick={() => setIsCommandOpen(false)}>
          <div
            style={{
              width: '100%',
              maxWidth: '560px',
              background: '#0e111a',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              borderRadius: '12px',
              boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(99, 102, 241, 0.25)',
              overflow: 'hidden',
              animation: 'modalPop 0.2s var(--ease-out-expo)'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Command Search Input Bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              padding: '14px 18px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              gap: '10px'
            }}>
              <Search size={18} style={{ color: 'var(--primary)' }} />
              <input
                type="text"
                placeholder="Type a command or jump to page..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                autoFocus
                style={{
                  flexGrow: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#ffffff',
                  fontSize: '0.95rem',
                  fontFamily: 'var(--font-sans)'
                }}
              />
              <button
                onClick={() => setIsCommandOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Command Results List */}
            <div style={{ maxHeight: '320px', overflowY: 'auto', padding: '8px' }}>
              {filteredCommands.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                  No matching commands found.
                </div>
              ) : (
                filteredCommands.map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setCurrentTab(item.id);
                        setIsCommandOpen(false);
                        setSearchQuery('');
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        color: '#f8fafc',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: '0.875rem',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Icon size={16} style={{ color: 'var(--primary)' }} />
                        <span>{item.label}</span>
                      </div>
                      <span style={{ fontSize: '0.68rem', padding: '2px 6px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', color: '#94a3b8' }}>
                        {item.category}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {/* Command Footer */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 16px',
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              background: 'rgba(255, 255, 255, 0.02)',
              fontSize: '0.72rem',
              color: '#64748b'
            }}>
              <span>Press <kbd style={{ padding: '1px 4px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px' }}>esc</kbd> to close</span>
              <span>SocialFlow Navigation</span>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <Suspense fallback={<GenericSkeleton minHeight={200} />}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        {/* GitHub sends the developer OAuth handshake back to the app: the
            server builds the authorize URL without a redirect_uri. */}
        <Route path="/developer/github/callback" element={<DeveloperGitHubCallback />} />
        <Route path="*" element={<AppContent />} />
      </Routes>
      </Suspense>
    </AuthProvider>
  );
};

export default App;
