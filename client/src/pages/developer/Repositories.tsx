import React, { useEffect, useState } from 'react';
import { 
  GitBranch, 
  RefreshCw, 
  Trash2, 
  ToggleLeft, 
  ToggleRight, 
  Download, 
  FolderGit2, 
  Clock, 
  Star, 
  Lock,
  X
} from 'lucide-react';
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
  return Number.isNaN(d.getTime()) ? 'Unknown' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '320px', color: '#9ca3af', fontSize: '0.875rem' }}>
        Loading repositories...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Action / Toolbar Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          Mirror and sync GitHub repositories to detect real development achievements.
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            onClick={loadAvailable}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
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
            <GitBranch size={14} style={{ color: '#6b7280' }} />
            <span>View on GitHub</span>
          </button>

          <button
            type="button"
            onClick={handleMirror}
            disabled={mirroring}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 18px',
              background: '#18181b',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.825rem',
              fontWeight: 600,
              cursor: mirroring ? 'not-allowed' : 'pointer',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}
          >
            <Download size={14} />
            <span>{mirroring ? 'Mirroring...' : 'Mirror All Repos'}</span>
          </button>
        </div>
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

      {/* Available Repos Modal / Drawer */}
      {showAvailable && (
        <div className="card" style={{ padding: '22px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0 }}>
              Repositories Detected on GitHub ({available.length})
            </h3>
            <button
              type="button"
              onClick={() => setShowAvailable(false)}
              style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '4px' }}
            >
              <X size={16} />
            </button>
          </div>
          <p style={{ fontSize: '0.825rem', color: '#6b7280', marginBottom: '16px' }}>
            Mirroring indexes commits, PRs, and releases into SocialFlow. Already mirrored repos are refreshed automatically.
          </p>

          {available.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>No repositories returned from your connected GitHub account.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
              {available.map(repo => (
                <div
                  key={repo.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: '#f9fafb',
                    borderRadius: '8px',
                    border: '1px solid #f3f4f6'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FolderGit2 size={16} style={{ color: '#111827' }} />
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
                      {repo.full_name}
                    </span>
                    {repo.private && (
                      <span style={{ fontSize: '0.68rem', padding: '1px 6px', background: '#fef3c7', color: '#92400e', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Lock size={10} /> Private
                      </span>
                    )}
                    {repo.language && (
                      <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>
                        {repo.language}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Star size={12} style={{ color: '#f59e0b' }} /> {repo.stargazers_count}
                    </span>
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      background: repo.connected ? '#ecfdf5' : '#f3f4f6',
                      color: repo.connected ? '#059669' : '#6b7280'
                    }}>
                      {repo.connected ? 'Mirrored' : 'Not mirrored'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sync Result Banner */}
      {syncResult && (
        <div className="card" style={{ padding: '22px 24px', background: '#ffffff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0 }}>
              Sync Telemetry: {syncResult.repo}
            </h3>
            <button
              type="button"
              onClick={() => setSyncResult(null)}
              style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '4px' }}
            >
              <X size={14} />
            </button>
          </div>

          {syncResult.result.isInitialSync && (
            <p style={{ fontSize: '0.825rem', color: '#059669', marginBottom: '12px', background: '#ecfdf5', padding: '8px 12px', borderRadius: '6px' }}>
              ✓ Initial baseline sync complete. Historical commits stored as context; future commits will trigger drafting.
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '14px' }}>
            <div style={{ padding: '10px 14px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #f3f4f6' }}>
              <div style={{ fontSize: '0.7rem', color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600 }}>Commits</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827' }}>{syncResult.result.counts.commits}</div>
            </div>
            <div style={{ padding: '10px 14px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #f3f4f6' }}>
              <div style={{ fontSize: '0.7rem', color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600 }}>Pull Requests</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827' }}>{syncResult.result.counts.pullRequests}</div>
            </div>
            <div style={{ padding: '10px 14px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #f3f4f6' }}>
              <div style={{ fontSize: '0.7rem', color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600 }}>Issues</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827' }}>{syncResult.result.counts.issues}</div>
            </div>
            <div style={{ padding: '10px 14px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #f3f4f6' }}>
              <div style={{ fontSize: '0.7rem', color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600 }}>Releases</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827' }}>{syncResult.result.counts.releases}</div>
            </div>
          </div>

          {syncResult.result.pipeline && (
            <div style={{ fontSize: '0.825rem', color: '#374151' }}>
              Pipeline: Detected {syncResult.result.pipeline.newActivityIds.length} new activities, recorded {syncResult.result.pipeline.memoryWritten} memory entries, queued {syncResult.result.pipeline.newOpportunities} opportunities.
            </div>
          )}
        </div>
      )}

      {/* Main Mirrored Repositories List */}
      {repos.length === 0 ? (
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
            No repositories mirrored
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#6b7280', maxWidth: '380px', lineHeight: 1.5, margin: 0 }}>
            Mirror your GitHub repositories to let SocialFlow analyze changes, detect milestones, and draft social posts.
          </p>
          <button
            type="button"
            onClick={handleMirror}
            disabled={mirroring}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 20px',
              background: '#18181b',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: mirroring ? 'not-allowed' : 'pointer'
            }}
          >
            <Download size={15} />
            <span>Mirror Repositories</span>
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {repos.map(repo => (
            <div
              key={repo._id}
              className="card"
              style={{
                padding: '20px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                flexWrap: 'wrap'
              }}
            >
              <div style={{ flexGrow: 1, minWidth: '240px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  <FolderGit2 size={18} style={{ color: '#111827' }} />
                  <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827' }}>
                    {repo.fullName}
                  </span>

                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    background: repo.syncStatus === 'synced' ? '#ecfdf5' : repo.syncStatus === 'error' ? '#fef2f2' : '#fef3c7',
                    color: repo.syncStatus === 'synced' ? '#059669' : repo.syncStatus === 'error' ? '#b91c1c' : '#b45309'
                  }}>
                    {SYNC_STATUS_LABELS[repo.syncStatus] ?? repo.syncStatus}
                  </span>

                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    background: repo.aiMonitoring ? '#eff6ff' : '#f3f4f6',
                    color: repo.aiMonitoring ? '#2563eb' : '#6b7280'
                  }}>
                    {repo.aiMonitoring ? 'AI Monitoring On' : 'AI Monitoring Off'}
                  </span>
                </div>

                {repo.description && (
                  <p style={{ fontSize: '0.825rem', color: '#6b7280', margin: '2px 0 6px 0', lineHeight: 1.4 }}>
                    {repo.description}
                  </p>
                )}

                <div style={{ fontSize: '0.75rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {repo.language && <span>{repo.language} •</span>}
                  <Clock size={12} />
                  <span>Last synced: {formatDate(repo.lastSyncedAt)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => handleSync(repo)}
                  disabled={busyId === repo._id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    background: '#18181b',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '0.825rem',
                    fontWeight: 600,
                    cursor: busyId === repo._id ? 'not-allowed' : 'pointer'
                  }}
                >
                  <RefreshCw size={13} className={busyId === repo._id ? 'animate-spin' : ''} />
                  <span>{busyId === repo._id ? 'Syncing...' : 'Sync Now'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleMonitoring(repo)}
                  disabled={busyId === repo._id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '0.825rem',
                    fontWeight: 500,
                    color: '#374151',
                    cursor: busyId === repo._id ? 'not-allowed' : 'pointer'
                  }}
                >
                  {repo.aiMonitoring ? <ToggleRight size={16} style={{ color: '#059669' }} /> : <ToggleLeft size={16} style={{ color: '#9ca3af' }} />}
                  <span>{repo.aiMonitoring ? 'Disable AI' : 'Enable AI'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDelete(repo)}
                  disabled={busyId === repo._id}
                  style={{
                    padding: '8px',
                    background: 'transparent',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    color: '#9ca3af',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="Remove repository"
                  onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#9ca3af')}
                >
                  <Trash2 size={15} />
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
