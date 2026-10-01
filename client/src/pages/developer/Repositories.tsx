import React, { useEffect, useState } from 'react';
import { GitBranch, RefreshCw, Trash2, ToggleLeft, ToggleRight, Download } from 'lucide-react';
import { api } from '../../services/api';

interface Repository {
  _id: string;
  name?: string;
  fullName: string;
  description?: string;
  language?: string;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  aiMonitoring: boolean;
  lastSyncedAt?: string | null;
}

interface AvailableRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  language: string | null;
  stargazers_count: number;
  connected: boolean;
}

interface SyncResult {
  isInitialSync: boolean;
  counts: { commits: number; pullRequests: number; issues: number; releases: number };
  pipeline: { memoryWritten: number; newOpportunities: number; baseline: boolean; newActivityIds: string[] } | null;
  generation: { generated: number; skipped: number; pending: number } | null;
  errors: string[];
}

interface RepositoriesProps {
  refreshKey: number;
}

function formatDate(value?: string | null): string {
  if (!value) return 'Never synced';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Unknown' : d.toLocaleString();
}

const SYNC_STATUS_LABELS: Record<Repository['syncStatus'], string> = {
  idle: 'Not synced',
  syncing: 'Syncing',
  synced: 'Synced',
  error: 'Sync error'
};

export const Repositories: React.FC<RepositoriesProps> = ({ refreshKey }) => {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [available, setAvailable] = useState<AvailableRepository[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mirroring, setMirroring] = useState(false);
  const [showAvailable, setShowAvailable] = useState(false);
  const [syncResult, setSyncResult] = useState<{ repo: string; result: SyncResult } | null>(null);

  // No setState before the first await: called from an effect, where
  // react-hooks/set-state-in-effect rejects synchronous state updates.
  // Handlers that need a visible loading state set it themselves.
  const load = async () => {
    try {
      const res = await api.developer.listRepositories();
      setRepos(res?.items ?? []);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not load repositories.');
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

  const loadAvailable = async () => {
    setError('');
    try {
      const res = await api.developer.listAvailableRepositories();
      setAvailable(res?.items ?? []);
      setShowAvailable(true);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not list GitHub repositories.');
    }
  };

  const handleMirror = async () => {
    setMirroring(true);
    setError('');
    setNotice('');
    try {
      const res = await api.developer.mirrorRepositories();
      setNotice(`Mirrored ${res.mirrored} of ${res.total} GitHub repositories.`);
      setShowAvailable(false);
      setLoading(true);
      await load();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not mirror repositories.');
    } finally {
      setMirroring(false);
    }
  };

  const handleSync = async (repo: Repository) => {
    setBusyId(repo._id);
    setError('');
    setNotice('');
    setSyncResult(null);
    try {
      const result = await api.developer.syncRepository(repo._id);
      setSyncResult({ repo: repo.fullName, result });
      setLoading(true);
      await load();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Sync failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleMonitoring = async (repo: Repository) => {
    setBusyId(repo._id);
    setError('');
    try {
      const updated = await api.developer.setRepositoryMonitoring(repo._id, !repo.aiMonitoring);
      setRepos(prev => prev.map(r => (r._id === repo._id ? { ...r, aiMonitoring: updated.aiMonitoring } : r)));
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not change AI monitoring.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (repo: Repository) => {
    if (!window.confirm(`Remove ${repo.fullName}? Its synced commits, activities, memory and opportunities are deleted too.`)) return;
    setBusyId(repo._id);
    setError('');
    setNotice('');
    try {
      await api.developer.deleteRepository(repo._id);
      setNotice(`${repo.fullName} removed.`);
      setLoading(true);
      await load();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not remove the repository.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <div style={{ padding: '60px', textAlign: 'center', color: 'hsl(var(--text-muted))' }}>Loading repositories...</div>;
  }

  return (
    <div>
      <div className="header-bar">
        <div>
          <h1 className="page-title">Repositories</h1>
          <p style={{ color: 'hsl(var(--text-secondary))', marginTop: '4px', fontSize: '0.95rem' }}>
            Mirror your GitHub repositories, then sync them to detect real development work.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={loadAvailable} className="btn btn-secondary" style={{ gap: '8px', fontSize: '0.85rem' }}>
            <GitBranch size={16} />
            <span>View on GitHub</span>
          </button>
          <button onClick={handleMirror} disabled={mirroring} className="btn btn-primary" style={{ gap: '8px', fontSize: '0.85rem' }}>
            <Download size={16} />
            <span>{mirroring ? 'Mirroring...' : 'Mirror all'}</span>
          </button>
        </div>
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

      {showAvailable && (
        <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '8px' }}>Repositories on GitHub</h2>
          <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-secondary))', marginBottom: '16px' }}>
            Mirroring copies every repository this account can see. Already mirrored ones are marked below and are refreshed, not duplicated.
          </p>
          {available.length === 0 ? (
            <p style={{ fontSize: '0.9rem', color: 'hsl(var(--text-muted))' }}>No repositories were returned by GitHub.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
              {available.map(repo => (
                <li key={repo.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600 }}>{repo.full_name}</span>
                  {repo.private && <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>Private</span>}
                  {repo.language && <span style={{ color: 'hsl(var(--text-muted))', fontSize: '0.75rem' }}>{repo.language}</span>}
                  <span style={{ color: 'hsl(var(--text-muted))', fontSize: '0.75rem' }}>{repo.stargazers_count} stars</span>
                  <span className={`badge ${repo.connected ? 'badge-success' : 'badge-pending'}`} style={{ fontSize: '0.65rem' }}>
                    {repo.connected ? 'Mirrored' : 'Not mirrored'}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button onClick={() => setShowAvailable(false)} className="btn btn-secondary" style={{ marginTop: '16px', fontSize: '0.8rem' }}>
            Close list
          </button>
        </div>
      )}

      {syncResult && (
        <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '12px' }}>Sync result: {syncResult.repo}</h2>
          {syncResult.result.isInitialSync && (
            <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-secondary))', marginBottom: '12px' }}>
              First sync for this repository, so its history was stored as a baseline and will not be auto-published.
            </p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--text-muted))' }}>Commits</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{syncResult.result.counts.commits}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--text-muted))' }}>Pull requests</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{syncResult.result.counts.pullRequests}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--text-muted))' }}>Issues</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{syncResult.result.counts.issues}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--text-muted))' }}>Releases</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{syncResult.result.counts.releases}</div>
            </div>
          </div>
          {syncResult.result.pipeline && (
            <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-secondary))', marginBottom: '8px' }}>
              Detected {syncResult.result.pipeline.newActivityIds.length} new activities, wrote {syncResult.result.pipeline.memoryWritten} memory entries, queued {syncResult.result.pipeline.newOpportunities} opportunities.
            </p>
          )}
          {syncResult.result.generation && (
            <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-secondary))', marginBottom: '8px' }}>
              Content generation: {syncResult.result.generation.generated} drafts created, {syncResult.result.generation.skipped} skipped, {syncResult.result.generation.pending} still pending.
            </p>
          )}
          {syncResult.result.errors.length > 0 && (
            <ul style={{ fontSize: '0.85rem', color: '#ef4444', paddingLeft: '18px', marginTop: '8px' }}>
              {syncResult.result.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}

      {repos.length === 0 ? (
        <div className="glass-card" style={{ padding: '60px', textAlign: 'center' }}>
          <GitBranch size={40} style={{ color: 'hsl(var(--text-muted) / 0.4)', marginBottom: '12px' }} />
          <h3 style={{ fontSize: '1.1rem', color: 'hsl(var(--text-secondary))', marginBottom: '8px' }}>No repositories mirrored</h3>
          <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-muted))' }}>
            Connect a GitHub account, then mirror your repositories to start detecting development work.
          </p>
          <button onClick={handleMirror} disabled={mirroring} className="btn btn-primary" style={{ marginTop: '16px', gap: '6px' }}>
            <Download size={16} />
            <span>Mirror all</span>
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {repos.map(repo => (
            <div key={repo._id} className="glass-card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ flexGrow: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, color: 'white' }}>{repo.fullName}</span>
                  <span className={`badge ${repo.syncStatus === 'synced' ? 'badge-success' : repo.syncStatus === 'error' ? 'badge-failed' : 'badge-pending'}`} style={{ fontSize: '0.65rem' }}>
                    {SYNC_STATUS_LABELS[repo.syncStatus] ?? repo.syncStatus}
                  </span>
                  <span className={`badge ${repo.aiMonitoring ? 'badge-info' : 'badge-failed'}`} style={{ fontSize: '0.65rem' }}>
                    {repo.aiMonitoring ? 'AI monitoring on' : 'AI monitoring off'}
                  </span>
                </div>
                {repo.description && (
                  <div style={{ fontSize: '0.85rem', color: 'hsl(var(--text-secondary))', marginBottom: '4px' }}>{repo.description}</div>
                )}
                <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>
                  {repo.language ? `${repo.language} | ` : ''}Last synced: {formatDate(repo.lastSyncedAt)}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleSync(repo)}
                  disabled={busyId === repo._id}
                  className="btn btn-primary"
                  style={{ fontSize: '0.8rem', gap: '6px' }}
                >
                  <RefreshCw size={14} />
                  <span>{busyId === repo._id ? 'Syncing...' : 'Sync now'}</span>
                </button>
                <button
                  onClick={() => handleToggleMonitoring(repo)}
                  disabled={busyId === repo._id}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.8rem', gap: '6px' }}
                >
                  {repo.aiMonitoring ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                  <span>{repo.aiMonitoring ? 'Disable AI' : 'Enable AI'}</span>
                </button>
                <button
                  onClick={() => handleDelete(repo)}
                  disabled={busyId === repo._id}
                  className="btn btn-danger"
                  style={{ fontSize: '0.8rem', gap: '6px' }}
                >
                  <Trash2 size={14} />
                  <span>Remove</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Repositories;
