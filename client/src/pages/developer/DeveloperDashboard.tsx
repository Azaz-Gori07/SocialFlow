import React, { useEffect, useState } from 'react';
import { 
  GitBranch, 
  RefreshCw, 
  Unlink, 
  History, 
  CheckCircle2, 
  Clock, 
  FolderGit2, 
  FileCode, 
  Sparkles, 
  BrainCircuit
} from 'lucide-react';
import { api } from '../../services/api';
import { GenericSkeleton } from '../../components/Skeleton';

interface Overview {
  enabled?: boolean;
  repositories: number;
  commits: number;
  activities: number;
  opportunities: number;
  memory: number;
}

interface RepositoryOption {
  _id: string;
  fullName: string;
}

interface SyncLog {
  _id: string;
  eventType: string;
  source: string;
  status: string;
  startedAt: string;
  errorMessage?: string;
}

interface GitHubConnection {
  connected: boolean;
  login?: string;
  avatarUrl?: string;
  connectedAt?: string;
}

interface DeveloperDashboardProps {
  refreshKey: number;
}

function formatDate(value?: string): string {
  if (!value) return 'Never';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Unknown' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const DeveloperDashboard: React.FC<DeveloperDashboardProps> = ({ refreshKey }) => {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [connection, setConnection] = useState<GitHubConnection | null>(null);
  const [repos, setRepos] = useState<RepositoryOption[]>([]);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [logsRepo, setLogsRepo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [ov, conn, repoRes] = await Promise.all([
        api.developer.overview(),
        api.developer.getGithubConnection(),
        api.developer.listRepositories()
      ]);
      setOverview(ov);
      setConnection(conn);
      const items: RepositoryOption[] = repoRes?.items ?? [];
      setRepos(items);
      setLogsRepo(prev => prev || (items[0]?._id ?? ''));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load the developer overview.';
      console.error(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const run = async () => {
      await load();
    };
    run();
  }, [refreshKey]);

  useEffect(() => {
    if (!logsRepo) return;
    let cancelled = false;
    api.developer
      .listSyncLogs(logsRepo, 10)
      .then(res => {
        if (!cancelled) setLogs(res?.items ?? []);
      })
      .catch(err => {
        console.error('Failed to load sync logs', err);
        if (!cancelled) {
          setLogs([]);
          setError(err instanceof Error ? err.message : 'Failed to load sync logs.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [logsRepo, refreshKey]);

  const handleConnect = async () => {
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const res = await api.developer.getGithubAuthUrl();
      if (!res?.url) throw new Error('No authorization URL was returned.');
      window.open(res.url, 'developer-github-oauth', 'width=680,height=760');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not start the GitHub connection.');
    } finally {
      setBusy(false);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    setError('');
    await load();
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect your GitHub account? Synced data is kept, but nothing new will be imported.')) return;
    setBusy(true);
    setNotice('');
    setError('');
    try {
      await api.developer.disconnectGithub();
      setNotice('GitHub account disconnected.');
      setLoading(true);
      await load();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not disconnect GitHub.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <GenericSkeleton minHeight={320} />;
  }

  const statItems = [
    { label: 'Mirrored Repos', value: overview?.repositories ?? 0, icon: FolderGit2, bg: '#f4f4f5', color: '#3f3f46' },
    { label: 'Synced Commits', value: overview?.commits ?? 0, icon: FileCode, bg: '#eff6ff', color: '#2563eb' },
    { label: 'Activities', value: overview?.activities ?? 0, icon: GitBranch, bg: '#ecfdf5', color: '#059669' },
    { label: 'Opportunities', value: overview?.opportunities ?? 0, icon: Sparkles, bg: '#fef3c7', color: '#b45309' },
    { label: 'Memory Facts', value: overview?.memory ?? 0, icon: BrainCircuit, bg: '#ffedd5', color: '#c2410c' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Action / Refresh Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>
          Real-time mirror statistics and automated pipeline telemetry.
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 14px',
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
          <RefreshCw size={14} style={{ color: '#6b7280' }} />
          <span>Refresh Telemetry</span>
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: '10px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}
      {notice && (
        <div style={{ padding: '12px 16px', borderRadius: '10px', background: '#ecfdf5', border: '1px solid #d1fae5', color: '#059669', fontSize: '0.85rem' }}>
          {notice}
        </div>
      )}

      {/* 5 Stats Cards Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '14px'
      }}>
        {statItems.map(stat => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="card"
              style={{
                padding: '18px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px'
              }}
            >
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: stat.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Icon size={18} style={{ color: stat.color }} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', fontWeight: 600 }}>
                  {stat.label}
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', lineHeight: 1.1, marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
                  {stat.value}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Two Column Layout: GitHub Connection + Recent Sync Activity */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.2fr 1.8fr',
        gap: '20px',
        alignItems: 'start'
      }} className="responsive-grid-1-1">
        
        {/* Left: GitHub Connection Card */}
        <div className="card" style={{ padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: '#f4f4f5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <GitBranch size={20} style={{ color: '#111827' }} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                GitHub Connection
              </h3>
              <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>
                OAuth link for repository webhooks and sync.
              </p>
            </div>
          </div>

          {connection?.connected ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              padding: '16px',
              background: '#f9fafb',
              borderRadius: '10px',
              border: '1px solid #f3f4f6'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {connection.avatarUrl ? (
                  <img src={connection.avatarUrl} alt="" style={{ width: '40px', height: '40px', borderRadius: '50%', border: '1px solid #e5e7eb' }} />
                ) : (
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#111827', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                    GH
                  </div>
                )}
                <div style={{ flexGrow: 1 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827' }}>
                    {connection.login || 'GitHub Account'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle2 size={12} style={{ color: '#10b981' }} />
                    <span>Connected {formatDate(connection.connectedAt)}</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={busy}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 14px',
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 500,
                    color: '#ef4444',
                    cursor: busy ? 'not-allowed' : 'pointer'
                  }}
                >
                  <Unlink size={13} />
                  <span>Disconnect Account</span>
                </button>
              </div>
            </div>
          ) : (
            <div style={{
              padding: '24px 20px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              background: '#f9fafb',
              borderRadius: '10px',
              border: '1px dashed #e5e7eb'
            }}>
              <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: 0, lineHeight: 1.5, maxWidth: '280px' }}>
                No GitHub account connected. Repository webhooks and automated drafting stay inactive until connected.
              </p>
              <button
                type="button"
                onClick={handleConnect}
                disabled={busy}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 18px',
                  background: '#18181b',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                }}
              >
                <GitBranch size={15} />
                <span>{busy ? 'Opening GitHub...' : 'Connect GitHub'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Right: Recent Sync Activity Card */}
        <div className="card" style={{ padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <History size={18} style={{ color: '#111827' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                Recent Sync Activity
              </h3>
            </div>

            {repos.length > 0 && (
              <select
                value={logsRepo}
                onChange={e => setLogsRepo(e.target.value)}
                style={{
                  height: '34px',
                  padding: '0 12px',
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  color: '#374151',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                {repos.map(r => (
                  <option key={r._id} value={r._id}>{r.fullName}</option>
                ))}
              </select>
            )}
          </div>

          {repos.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>
              No repositories mirrored yet. Use the Repositories tab to connect your repos.
            </div>
          ) : logs.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>
              No sync events recorded for this repository yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {logs.map(log => (
                <div
                  key={log._id}
                  style={{
                    padding: '10px 14px',
                    background: '#fafaf9',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827' }}>
                      {log.eventType}
                    </span>
                    <span style={{
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      padding: '2px 7px',
                      borderRadius: '4px',
                      background: '#f3f4f6',
                      color: '#4b5563',
                      textTransform: 'uppercase'
                    }}>
                      {log.source}
                    </span>
                    <span style={{
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      padding: '2px 7px',
                      borderRadius: '9999px',
                      background: log.status === 'completed' ? '#ecfdf5' : log.status === 'failed' ? '#fef2f2' : '#fef3c7',
                      color: log.status === 'completed' ? '#059669' : log.status === 'failed' ? '#b91c1c' : '#b45309',
                      textTransform: 'capitalize'
                    }}>
                      {log.status}
                    </span>
                  </div>

                  <span style={{ fontSize: '0.75rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} />
                    <span>{formatDate(log.startedAt)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
