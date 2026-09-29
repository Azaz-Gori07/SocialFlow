import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { DeveloperDashboard } from './DeveloperDashboard';
import { Repositories } from './Repositories';
import { Activities } from './Activities';
import { Opportunities } from './Opportunities';
import { Memory } from './Memory';
import { DeveloperSettings } from './Settings';

type TabId = 'dashboard' | 'repositories' | 'activities' | 'opportunities' | 'memory' | 'settings';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'repositories', label: 'Repositories' },
  { id: 'activities', label: 'Activities' },
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'memory', label: 'Memory' },
  { id: 'settings', label: 'Settings' }
];

/**
 * Feature gate + sub-navigation for the Developer Intelligence flow.
 *
 * /developer/status is the only ungated route, so it is the only honest source
 * for "should this UI exist". Anything other than `enabled === true` renders
 * the disabled card: a request failure is treated as disabled, never as
 * enabled-with-errors.
 */
export const DeveloperShell: React.FC = () => {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  // Bumped by the OAuth popup so GitHub-bound pages can refetch once connected.
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
      <div className="animate-fade-in" style={{ position: 'relative' }}>
        <div className="glow-blur" />
        <div style={{ padding: '60px', textAlign: 'center', color: 'hsl(var(--text-muted))', fontSize: '0.9rem' }}>
          Checking Developer flow availability...
        </div>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="animate-fade-in" style={{ position: 'relative' }}>
        <div className="glow-blur" />
        <div className="glass-card" style={{ padding: '40px', textAlign: 'center' }}>
          <h1 className="page-title" style={{ fontSize: '1.4rem', marginBottom: '10px' }}>Developer</h1>
          <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.9rem' }}>
            Developer flow is disabled.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ position: 'relative' }}>
      <div className="glow-blur" />

      <nav aria-label="Developer sections" style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={activeTab === tab.id ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ fontSize: '0.8rem' }}
            aria-current={activeTab === tab.id ? 'page' : undefined}
          >
            {tab.label}
          </button>
        ))}
      </nav>

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
