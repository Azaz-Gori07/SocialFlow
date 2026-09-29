import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Activity as ActivityIcon } from 'lucide-react';
import { api } from '../../services/api';

interface Activity {
  _id: string;
  title: string;
  type: string;
  importance: 'TRIVIAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'MILESTONE';
  importanceScore: number;
  isMilestone: boolean;
  linkedInWorthy: boolean;
  confidence: number;
  detectedAt: string;
  changes: string[];
  affectedAreas: string[];
  summary?: string;
  problem?: string;
  evidence: {
    prNumbers?: number[];
    issueNumbers?: number[];
    commitCount?: number;
    fileCount?: number;
    totalAdditions?: number;
    totalDeletions?: number;
  };
}

interface RepositoryOption {
  _id: string;
  fullName: string;
}

const PAGE_SIZE = 20;
const IMPORTANCE_OPTIONS = ['TRIVIAL', 'LOW', 'MEDIUM', 'HIGH', 'MILESTONE'] as const;

function formatDate(value?: string): string {
  if (!value) return 'Unknown';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Unknown' : d.toLocaleString();
}

const IMPORTANCE_BADGE: Record<Activity['importance'], string> = {
  TRIVIAL: 'badge-info',
  LOW: 'badge-info',
  MEDIUM: 'badge-pending',
  HIGH: 'badge-success',
  MILESTONE: 'badge-success'
};

export const Activities: React.FC = () => {
  const [items, setItems] = useState<Activity[]>([]);
  const [total, setTotal] = useState(0);
  const [repos, setRepos] = useState<RepositoryOption[]>([]);
  const [repoId, setRepoId] = useState('');
  const [importance, setImportance] = useState('');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    api.developer
      .listRepositories()
      .then(res => setRepos(res?.items ?? []))
      .catch(err => console.error('Failed to load repositories for filter', err));
  }, []);

  // No setState before the first await: called from an effect, where
  // react-hooks/set-state-in-effect rejects synchronous state updates.
  // The filter handlers set the loading flag themselves.
  const load = useCallback(async () => {
    try {
      const res = await api.developer.listActivities({
        repositoryId: repoId || undefined,
        importance: importance || undefined,
        limit: PAGE_SIZE,
        offset
      });
      setItems(res?.items ?? []);
      setTotal(res?.total ?? 0);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not load activities.');
    } finally {
      setLoading(false);
    }
  }, [repoId, importance, offset]);

  useEffect(() => {
    const run = async () => {
      await load();
    };
    run();
  }, [load]);

  // Changing a filter must return to the first page, or "next" can land on nothing.
  const handleRepoChange = (value: string) => {
    setOffset(0);
    setRepoId(value);
    setLoading(true);
  };
  const handleImportanceChange = (value: string) => {
    setOffset(0);
    setImportance(value);
    setLoading(true);
  };
  const handlePageChange = (delta: number) => {
    setOffset(o => Math.max(0, o + delta));
    setLoading(true);
  };

  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;

  return (
    <div>
      <div className="header-bar">
        <div>
          <h1 className="page-title">Activities</h1>
          <p style={{ color: 'hsl(var(--text-secondary))', marginTop: '4px', fontSize: '0.95rem' }}>
            Development work detected from your commits, pull requests and issues.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ minWidth: '240px' }}>
          <label htmlFor="dev-activity-repo" className="form-label" style={{ fontSize: '0.8rem' }}>Repository</label>
          <select
            id="dev-activity-repo"
            className="form-input"
            style={{ padding: '10px 14px', fontSize: '0.85rem' }}
            value={repoId}
            onChange={e => handleRepoChange(e.target.value)}
          >
            <option value="">All repositories</option>
            {repos.map(r => (
              <option key={r._id} value={r._id}>{r.fullName}</option>
            ))}
          </select>
        </div>
        <div style={{ minWidth: '200px' }}>
          <label htmlFor="dev-activity-importance" className="form-label" style={{ fontSize: '0.8rem' }}>Importance</label>
          <select
            id="dev-activity-importance"
            className="form-input"
            style={{ padding: '10px 14px', fontSize: '0.85rem' }}
            value={importance}
            onChange={e => handleImportanceChange(e.target.value)}
          >
            <option value="">Any importance</option>
            {IMPORTANCE_OPTIONS.map(level => (
              <option key={level} value={level}>{level.charAt(0) + level.slice(1).toLowerCase()}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div role="alert" style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', marginBottom: '16px', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'hsl(var(--text-muted))' }}>Loading activities...</div>
      ) : items.length === 0 ? (
        <div className="glass-card" style={{ padding: '60px', textAlign: 'center' }}>
          <ActivityIcon size={40} style={{ color: 'hsl(var(--text-muted) / 0.4)', marginBottom: '12px' }} />
          <h3 style={{ fontSize: '1.1rem', color: 'hsl(var(--text-secondary))', marginBottom: '8px' }}>No activities detected</h3>
          <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-muted))' }}>
            Sync a repository from the Repositories tab to detect development work.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {items.map(activity => {
            const isOpen = expandedId === activity._id;
            return (
              <div key={activity._id} className="glass-card" style={{ padding: '18px 20px' }}>
                <button
                  onClick={() => setExpandedId(isOpen ? null : activity._id)}
                  aria-expanded={isOpen}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'flex-start', gap: '12px',
                    background: 'none', border: 'none', color: 'inherit', cursor: 'pointer',
                    padding: 0, textAlign: 'left', fontFamily: 'var(--font-sans)'
                  }}
                >
                  {isOpen ? <ChevronDown size={16} style={{ color: 'hsl(var(--text-muted))', marginTop: '3px', flexShrink: 0 }} />
                         : <ChevronRight size={16} style={{ color: 'hsl(var(--text-muted))', marginTop: '3px', flexShrink: 0 }} />}
                  <span style={{ flexGrow: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600, color: 'white', marginBottom: '6px' }}>{activity.title}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>{activity.type}</span>
                      <span className={`badge ${IMPORTANCE_BADGE[activity.importance]}`} style={{ fontSize: '0.65rem' }}>{activity.importance}</span>
                      <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>Score {activity.importanceScore}</span>
                      {activity.isMilestone && <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>Milestone</span>}
                      {activity.linkedInWorthy && <span className="badge badge-pending" style={{ fontSize: '0.65rem' }}>LinkedIn worthy</span>}
                      <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>{formatDate(activity.detectedAt)}</span>
                    </span>
                  </span>
                </button>

                {isOpen && (
                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-glass)' }}>
                    {activity.problem && (
                      <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-secondary))', marginBottom: '12px' }}>{activity.problem}</p>
                    )}
                    {activity.changes.length > 0 && (
                      <div style={{ marginBottom: '12px' }}>
                        <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--text-muted))', marginBottom: '8px' }}>Changes</h3>
                        <ul style={{ paddingLeft: '18px', fontSize: '0.85rem', color: 'hsl(var(--text-secondary))' }}>
                          {activity.changes.map((change, i) => <li key={i}>{change}</li>)}
                        </ul>
                      </div>
                    )}
                    {activity.affectedAreas.length > 0 && (
                      <div style={{ marginBottom: '12px' }}>
                        <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--text-muted))', marginBottom: '8px' }}>Affected areas</h3>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {activity.affectedAreas.map(area => (
                            <span key={area} className="badge badge-info" style={{ fontSize: '0.65rem' }}>{area}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--text-muted))', marginBottom: '8px' }}>Evidence</h3>
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '0.85rem', color: 'hsl(var(--text-secondary))' }}>
                        <span>{activity.evidence?.commitCount ?? 0} commits</span>
                        <span>{(activity.evidence?.prNumbers ?? []).length} pull requests</span>
                        <span>{(activity.evidence?.issueNumbers ?? []).length} issues</span>
                        <span>{activity.evidence?.fileCount ?? 0} files changed</span>
                        <span>{activity.evidence?.totalAdditions ?? 0} additions</span>
                        <span>{activity.evidence?.totalDeletions ?? 0} deletions</span>
                        <span>Confidence {activity.confidence}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '20px', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>
            Showing {offset + 1} to {Math.min(offset + PAGE_SIZE, total)} of {total}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => handlePageChange(-PAGE_SIZE)} disabled={!hasPrev} className="btn btn-secondary" style={{ fontSize: '0.8rem' }}>
              Previous
            </button>
            <button onClick={() => handlePageChange(PAGE_SIZE)} disabled={!hasNext} className="btn btn-secondary" style={{ fontSize: '0.8rem' }}>
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Activities;
