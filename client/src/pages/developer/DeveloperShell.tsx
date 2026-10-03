import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { DeveloperDashboard } from './DeveloperDashboard';
import { Repositories } from './Repositories';
import { Activities } from './Activities';
import { Opportunities } from './Opportunities';
import { Memory } from './Memory';
import { DeveloperSettings } from './Settings';
import { GitBranch } from 'lucide-react';

type TabId = 'dashboard' | 'repositories' | 'activities' | 'opportunities' | 'memory' | 'settings';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'repositories', label: 'Repositories' },
  { id: 'activities', label: 'Activities' },
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'memory', label: 'Memory' },
  { id: 'settings', label: 'Settings' }
];

export const DeveloperShell: React.FC = () => {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.developer
      .status()
      .then(res => {
        if (!cancelled) setEnabled(res?.enabled === true);
      })
      .catch(err => {
        console.error('Developer status check failed', err);
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if ((event.data as { type?: string } | null)?.type === 'developer:github-connected') {
        setRefreshKey(k => k + 1);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  if (enabled === null) {
    return (
      <div className="animate-fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '360px', color: '#9ca3af', fontSize: '0.875rem' }}>
        Checking Developer Intelligence availability...
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
        <div>
          <div style={{
            fontSize: '0.6875rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: '#6b7280',
            textTransform: 'uppercase',
            marginBottom: '3px'
          }}>
            INTELLIGENCE
          </div>
          <h1 style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: '2.4rem',
            fontWeight: 700,
            color: '#111827',
            letterSpacing: '-0.02em',
            marginBottom: '4px',
            lineHeight: 1.15
          }}>
            Developer Intelligence
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.4 }}>
            Turn repository commits, PRs, and releases into evidence-backed audience growth.
          </p>
        </div>

        <div className="card" style={{ padding: '60px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: '#f4f4f5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '4px'
          }}>
            <GitBranch size={28} style={{ color: '#71717a' }} />
          </div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', margin: 0 }}>
            Developer Intelligence Disabled
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#6b7280', maxWidth: '420px', lineHeight: 1.5, margin: 0 }}>
            The developer intelligence domain is currently turned off on this instance. Set <code>DEVELOPER_FLOW_ENABLED=true</code> on the server to enable repository mirroring and automatic drafting.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      
      {/* 1. Header Banner */}
      <div>
        <div style={{
          fontSize: '0.6875rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: '#6b7280',
          textTransform: 'uppercase',
          marginBottom: '3px'
        }}>
          INTELLIGENCE
        </div>
        <h1 style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: '2.4rem',
          fontWeight: 700,
          color: '#111827',
          letterSpacing: '-0.02em',
          marginBottom: '4px',
          lineHeight: 1.15
        }}>
          Developer Intelligence
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.4 }}>
          Turn repository commits, PRs, and releases into evidence-backed audience growth.
        </p>
      </div>

      {/* 2. Sub-Navigation Tabs */}
      <nav aria-label="Developer sections" style={{
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '7px 16px',
                fontSize: '0.825rem',
                fontWeight: isActive ? 600 : 500,
                background: isActive ? '#18181b' : '#ffffff',
                color: isActive ? '#ffffff' : '#374151',
                border: isActive ? 'none' : '1px solid #e5e7eb',
                borderRadius: '8px',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={e => {
                if (!isActive) e.currentTarget.style.borderColor = '#d1d5db';
              }}
              onMouseLeave={e => {
                if (!isActive) e.currentTarget.style.borderColor = '#e5e7eb';
              }}
              aria-current={isActive ? 'page' : undefined}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* 3. Active Sub-View */}
      {activeTab === 'dashboard' && <DeveloperDashboard refreshKey={refreshKey} />}
      {activeTab === 'repositories' && <Repositories refreshKey={refreshKey} />}
      {activeTab === 'activities' && <Activities />}
      {activeTab === 'opportunities' && <Opportunities />}
      {activeTab === 'memory' && <Memory />}
      {activeTab === 'settings' && <DeveloperSettings />}
    </div>
  );
};

export default DeveloperShell;
