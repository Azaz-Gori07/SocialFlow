import React, { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Sidebar } from './components/Sidebar';
import { Auth } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { ContentStudio } from './pages/ContentStudio';
import { Scheduler } from './pages/Scheduler';
import { Comments } from './pages/Comments';
import { Analytics } from './pages/Analytics';
import { Workspaces } from './pages/Workspaces';
import { Settings } from './pages/Settings';
import { NotificationCenter } from './pages/NotificationCenter';
import { NotificationPreferences } from './pages/NotificationPreferences';
import { AuthCallback } from './pages/AuthCallback';
import { Menu, Layers } from 'lucide-react';

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', backgroundColor: 'hsl(var(--bg-base))' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.05)', borderTopColor: 'hsl(var(--primary))', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: '0.9rem', color: 'hsl(var(--text-secondary))', fontFamily: 'var(--font-sans)' }}>Establishing secure link...</span>
        </div>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // If user is not authenticated, render Auth login/register view
  if (!user) {
    return <Auth />;
  }

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
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="app-container">
      {/* Mobile Top Bar */}
      <header className="mobile-header-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), #00F2FE)', borderRadius: '6px', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Layers size={16} color="white" />
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.15rem', background: 'linear-gradient(135deg, #fff, hsl(var(--text-secondary)))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            ViralDrift AI
          </span>
        </div>
        <button 
          className="mobile-menu-btn" 
          onClick={() => setIsSidebarOpen(true)}
          title="Open Menu"
        >
          <Menu size={20} />
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
          setIsSidebarOpen(false); // Close sidebar on selection
        }} 
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
      />
      
      {/* Main Workspace Frame */}
      <main className="content-wrapper">
        {renderActivePage()}
      </main>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="*" element={<AppContent />} />
      </Routes>
    </AuthProvider>
  );
};

export default App;
