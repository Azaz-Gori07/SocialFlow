import React, { useEffect, useState } from 'react';
import { GitBranch, RefreshCw, Unlink, History } from 'lucide-react';
import { api } from '../../services/api';

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

const STAT_LABELS: Array<{ key: keyof Overview; label: string }> = [
  { key: 'repositories', label: 'Repositories' },
  { key: 'commits', label: 'Commits' },
  { key: 'activities', label: 'Activities' },
  { key: 'opportunities', label: 'Opportunities' },
  { key: 'memory', label: 'Memory entries' }
];

function formatDate(value?: string): string {
  if (!value) return 'Never';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Unknown' : d.toLocaleString();
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

  // No setState before the first await: this is called from an effect, and
  // react-hooks/set-state-in-effect rejects synchronous state updates there.
  // Callers that want a visible loading state set it themselves.
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

  // Sync logs are per-repository: the server rejects a request without one.
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
    return <div style={{ padding: '60px', textAlign: 'center', color: 'hsl(var(--text-muted))' }}>Loading developer overview...</div>;
  }

  return (
    <div>
      <div className="header-bar">
        <div>
          <h1 className="page-title">Developer Intelligence</h1>
          <p style={{ color: 'hsl(var(--text-secondary))', marginTop: '4px', fontSize: '0.95rem' }}>
            What your repositories shipped, and what is ready to publish.
          </p>
        </div>
        <button onClick={handleRefresh} className="btn btn-secondary" style={{ gap: '8px', fontSize: '0.85rem' }}>
          <RefreshCw size={16} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div role="alert" style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', marginBottom: '16px', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}
      {notice && (
        <div role="status" style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981', marginBottom: '16px', fontSize: '0.9rem' }}>
          {notice}
        </div>
      )}

      <div className="responsive-stat-grid">
        {STAT_LABELS.map(stat => (
          <div key={stat.key} className="glass-card" style={{ padding: '20px' }}>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--text-muted))' }}>{stat.label}</div>
            <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '8px' }}>{overview?.[stat.key] ?? 0}</div>
          </div>
        ))}
      </div>

      <div className="responsive-grid-1-1" style={{ marginBottom: '24px' }}>
        <div className="glass-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GitBranch size={16} style={{ color: 'hsl(var(--primary))' }} />
            <span>GitHub connection</span>
          </h2>
          {connection?.connected ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              {connection.avatarUrl && (
                <img src={connection.avatarUrl} alt="" style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid var(--border-glass)' }} />
              )}
              <div style={{ flexGrow: 1 }}>
                <div style={{ fontWeight: 600 }}>{connection.login || 'GitHub account'}</div>
                <div style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>
                  Connected {formatDate(connection.connectedAt)}
                </div>
              </div>
              <button onClick={handleDisconnect} disabled={busy} className="btn btn-secondary" style={{ fontSize: '0.8rem', gap: '6px' }}>
                <Unlink size={14} />
                <span>Disconnect</span>
              </button>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: '0.9rem', color: 'hsl(var(--text-secondary))', marginBottom: '16px' }}>
                No GitHub account is connected. Syncing repositories and the intelligence pipeline stay off until you connect one.
              </p>
              <button onClick={handleConnect} disabled={busy} className="btn btn-primary" style={{ fontSize: '0.85rem', gap: '6px' }}>
                <GitBranch size={16} />
                <span>{busy ? 'Opening GitHub...' : 'Connect GitHub'}</span>
              </button>
            </div>
          )}
        </div>

        <div className="glass-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <History size={16} style={{ color: 'hsl(var(--secondary))' }} />
            <span>Recent sync activity</span>
          </h2>
          {repos.length === 0 ? (
            <p style={{ fontSize: '0.9rem', color: 'hsl(var(--text-muted))' }}>
              No repositories are mirrored yet.
            </p>
          ) : (
            <>
              <div style={{ marginBottom: '14px' }}>
                <label htmlFor="dev-sync-log-repo" className="form-label" style={{ fontSize: '0.8rem' }}>Repository</label>
                <select
                  id="dev-sync-log-repo"
                  className="form-input"
                  style={{ padding: '8px 12px', fontSize: '0.85rem' }}
                  value={logsRepo}
                  onChange={e => setLogsRepo(e.target.value)}
                >
                  {repos.map(r => (
                    <option key={r._id} value={r._id}>{r.fullName}</option>
                  ))}
                </select>
              </div>
              {logs.length === 0 ? (
                <p style={{ fontSize: '0.9rem', color: 'hsl(var(--text-muted))' }}>No sync runs recorded for this repository yet.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {logs.map(log => (
                    <li key={log._id} style={{ borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{log.eventType}</span>
                        <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>{log.source}</span>
                        <span className={`badge ${log.status === 'completed' ? 'badge-success' : log.status === 'failed' ? 'badge-failed' : 'badge-pending'}`} style={{ fontSize: '0.65rem' }}>
                          {log.status}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', marginTop: '4px' }}>{formatDate(log.startedAt)}</div>
                      {log.errorMessage && (
                        <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '4px' }}>{log.errorMessage}</div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DeveloperDashboard;
