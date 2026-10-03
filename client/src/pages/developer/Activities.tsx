import React, { useCallback, useEffect, useState } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  Activity as ActivityIcon, 
  Clock, 
  Sparkles
} from 'lucide-react';
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
  return Number.isNaN(d.getTime()) ? 'Unknown' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Filter Row */}
      <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label htmlFor="dev-activity-repo" style={{ fontSize: '0.825rem', fontWeight: 600, color: '#374151' }}>
            Repository:
          </label>
          <div style={{ position: 'relative' }}>
            <select
              id="dev-activity-repo"
              value={repoId}
              onChange={e => handleRepoChange(e.target.value)}
              style={{
                height: '36px',
                paddingLeft: '12px',
                paddingRight: '30px',
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '0.825rem',
                color: '#111827',
                outline: 'none',
                cursor: 'pointer',
                appearance: 'none',
                minWidth: '180px'
              }}
            >
              <option value="">All repositories</option>
              {repos.map(r => (
                <option key={r._id} value={r._id}>{r.fullName}</option>
              ))}
            </select>
            <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label htmlFor="dev-activity-importance" style={{ fontSize: '0.825rem', fontWeight: 600, color: '#374151' }}>
            Importance:
          </label>
          <div style={{ position: 'relative' }}>
            <select
              id="dev-activity-importance"
              value={importance}
              onChange={e => handleImportanceChange(e.target.value)}
              style={{
                height: '36px',
                paddingLeft: '12px',
                paddingRight: '30px',
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '0.825rem',
                color: '#111827',
                outline: 'none',
                cursor: 'pointer',
                appearance: 'none',
                minWidth: '150px'
              }}
            >
              <option value="">Any importance</option>
              {IMPORTANCE_OPTIONS.map(level => (
                <option key={level} value={level}>{level.charAt(0) + level.slice(1).toLowerCase()}</option>
              ))}
            </select>
            <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
          </div>
        </div>

        <div style={{ flexGrow: 1 }} />
        <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
          {total} activities tracked
        </span>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: '10px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px', color: '#9ca3af', fontSize: '0.875rem' }}>
          Loading activities...
        </div>
      ) : items.length === 0 ? (
        <div className="card" style={{ padding: '60px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '4px' }}>
            <ActivityIcon size={28} style={{ color: '#71717a' }} />
          </div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#111827', margin: 0 }}>
            No activities detected
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#6b7280', maxWidth: '380px', lineHeight: 1.5, margin: 0 }}>
            Sync a repository from the Repositories tab to detect and score engineering development work.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {items.map(activity => {
            const isOpen = expandedId === activity._id;
            return (
              <div 
                key={activity._id} 
                className="card" 
                style={{ padding: '18px 22px' }}
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(isOpen ? null : activity._id)}
                  aria-expanded={isOpen}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    padding: 0,
                    textAlign: 'left'
                  }}
                >
                  {isOpen ? (
                    <ChevronDown size={18} style={{ color: '#6b7280', marginTop: '2px', flexShrink: 0 }} />
                  ) : (
                    <ChevronRight size={18} style={{ color: '#9ca3af', marginTop: '2px', flexShrink: 0 }} />
                  )}

                  <div style={{ flexGrow: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827' }}>
                        {activity.title}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={12} />
                        <span>{formatDate(activity.detectedAt)}</span>
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '2px 8px',
                        background: '#f3f4f6',
                        color: '#4b5563',
                        borderRadius: '4px',
                        textTransform: 'uppercase'
                      }}>
                        {activity.type}
                      </span>

                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        background: activity.importance === 'MILESTONE' || activity.importance === 'HIGH' ? '#ecfdf5' : activity.importance === 'MEDIUM' ? '#fef3c7' : '#eff6ff',
                        color: activity.importance === 'MILESTONE' || activity.importance === 'HIGH' ? '#059669' : activity.importance === 'MEDIUM' ? '#b45309' : '#2563eb'
                      }}>
                        {activity.importance}
                      </span>

                      <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        Score: <strong style={{ color: '#111827' }}>{activity.importanceScore}</strong>
                      </span>

                      {activity.isMilestone && (
                        <span style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          padding: '2px 8px',
                          background: '#ecfdf5',
                          color: '#059669',
                          borderRadius: '9999px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}>
                          <Sparkles size={11} /> Milestone
                        </span>
                      )}

                      {activity.linkedInWorthy && (
                        <span style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          padding: '2px 8px',
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          borderRadius: '9999px'
                        }}>
                          LinkedIn Worthy
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {activity.problem && (
                      <p style={{ fontSize: '0.85rem', color: '#4b5563', margin: 0, lineHeight: 1.5 }}>
                        {activity.problem}
                      </p>
                    )}

                    {activity.changes.length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', fontWeight: 600, marginBottom: '6px' }}>
                          Key Changes
                        </div>
                        <ul style={{ paddingLeft: '18px', fontSize: '0.825rem', color: '#374151', lineHeight: 1.5, margin: 0 }}>
                          {activity.changes.map((change, i) => (
                            <li key={i}>{change}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {activity.affectedAreas.length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', fontWeight: 600, marginBottom: '6px' }}>
                          Affected Components
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {activity.affectedAreas.map(area => (
                            <span key={area} style={{ fontSize: '0.7rem', padding: '2px 8px', background: '#f3f4f6', color: '#374151', borderRadius: '4px' }}>
                              {area}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Evidence Box */}
                    <div style={{ padding: '12px 14px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #f3f4f6' }}>
                      <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', fontWeight: 600, marginBottom: '6px' }}>
                        Pipeline Evidence
                      </div>
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '0.78rem', color: '#4b5563' }}>
                        <span><strong>{activity.evidence?.commitCount ?? 0}</strong> commits</span>
                        <span><strong>{(activity.evidence?.prNumbers ?? []).length}</strong> pull requests</span>
                        <span><strong>{(activity.evidence?.issueNumbers ?? []).length}</strong> issues</span>
                        <span><strong>{activity.evidence?.fileCount ?? 0}</strong> files changed</span>
                        <span>+<strong>{activity.evidence?.totalAdditions ?? 0}</strong> / -<strong>{activity.evidence?.totalDeletions ?? 0}</strong> lines</span>
                        <span>Confidence: <strong>{activity.confidence}%</strong></span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {!loading && total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', flexWrap: 'wrap', gap: '12px' }}>
          <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
            Showing {offset + 1} to {Math.min(offset + PAGE_SIZE, total)} of {total} activities
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => handlePageChange(-PAGE_SIZE)}
              disabled={!hasPrev}
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem', padding: '6px 14px' }}
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => handlePageChange(PAGE_SIZE)}
              disabled={!hasNext}
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem', padding: '6px 14px' }}
            >
              Next
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default Activities;
