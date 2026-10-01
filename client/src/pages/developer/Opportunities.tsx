import React, { useCallback, useEffect, useState } from 'react';
import { Lightbulb, Play, Sparkles } from 'lucide-react';
import { api } from '../../services/api';

interface Opportunity {
  _id: string;
  title: string;
  summary?: string;
  status: 'baseline' | 'pending' | 'generated' | 'skipped' | 'rejected';
  repositoryId: string;
  sourceType: string;
  createdAt: string;
  metadata: { importance?: string; importanceScore?: number };
}

const STATUS_TABS = ['all', 'pending', 'generated', 'skipped', 'rejected', 'baseline'] as const;
const SETTABLE_STATUSES = ['pending', 'skipped', 'rejected'] as const;

const STATUS_BADGE: Record<Opportunity['status'], string> = {
  baseline: 'badge-info',
  pending: 'badge-pending',
  generated: 'badge-success',
  skipped: 'badge-info',
  rejected: 'badge-failed'
};

const SETTABLE_LABELS: Record<(typeof SETTABLE_STATUSES)[number], string> = {
  pending: 'Move to pending',
  skipped: 'Skip',
  rejected: 'Reject'
};

function formatDate(value?: string): string {
  if (!value) return 'Unknown';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Unknown' : d.toLocaleString();
}

export const Opportunities: React.FC = () => {
  const [items, setItems] = useState<Opportunity[]>([]);
  const [total, setTotal] = useState(0);
  const [repos, setRepos] = useState<Array<{ _id: string; fullName: string }>>([]);
  const [status, setStatus] = useState<(typeof STATUS_TABS)[number]>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [autoRunning, setAutoRunning] = useState(false);

  useEffect(() => {
    api.developer
      .listRepositories()
      .then(res => setRepos(res?.items ?? []))
      .catch(err => console.error('Failed to load repositories for names', err));
  }, []);

  // No setState before the first await: called from an effect, where
  // react-hooks/set-state-in-effect rejects synchronous state updates.
  // The status tabs and row actions set the loading flag themselves.
  const load = useCallback(async () => {
    try {
      const res = await api.developer.listOpportunities({
        status: status === 'all' ? undefined : status,
        limit: 50
      });
      setItems(res?.items ?? []);
      setTotal(res?.total ?? 0);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not load opportunities.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    const run = async () => {
      await load();
    };
    run();
  }, [load]);

  const handleStatusTabChange = (next: (typeof STATUS_TABS)[number]) => {
    setStatus(next);
    setLoading(true);
  };

  const repoName = (id: string) => repos.find(r => r._id === id)?.fullName ?? 'Unknown repository';

  const handleGenerate = async (opportunity: Opportunity) => {
    setBusyId(opportunity._id);
    setError('');
    setNotice('');
    try {
      const res = await api.developer.generateOpportunity(opportunity._id);
      const count = res?.drafts?.length ?? 0;
      const failed = res?.failedVariants?.length ?? 0;
      setLoading(true);
      setNotice(
        count > 0
          ? `${count} draft${count === 1 ? '' : 's'} added to the Draft Library.${failed > 0 ? ` ${failed} variant(s) failed validation.` : ''}`
          : 'No drafts were produced.'
      );
      await load();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not generate drafts.');
    } finally {
      setBusyId(null);
    }
  };

  const handleStatusChange = async (opportunity: Opportunity, next: string) => {
    setBusyId(opportunity._id);
    setError('');
    setNotice('');
    try {
      await api.developer.setOpportunityStatus(opportunity._id, next);
      setNotice(`"${opportunity.title}" moved to ${next}.`);
      setLoading(true);
      await load();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not update the status.');
    } finally {
      setBusyId(null);
    }
  };

  const handleAutoRun = async () => {
    setAutoRunning(true);
    setError('');
    setNotice('');
    try {
      const res = await api.developer.runContentAutoGeneration();
      setNotice(
        `Auto-generation finished: ${res?.generated ?? 0} drafts created, ${res?.skipped ?? 0} skipped, ${res?.pending ?? 0} still pending.`
      );
      setLoading(true);
      await load();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Auto-generation run failed.');
    } finally {
      setAutoRunning(false);
    }
  };

  return (
    <div>
      <div className="header-bar">
        <div>
          <h1 className="page-title">Opportunities</h1>
          <p style={{ color: 'hsl(var(--text-secondary))', marginTop: '4px', fontSize: '0.95rem' }}>
            Development work worth posting about. Generating drafts never publishes anything.
          </p>
        </div>
        <button onClick={handleAutoRun} disabled={autoRunning} className="btn btn-primary" style={{ gap: '8px', fontSize: '0.85rem' }}>
          <Play size={16} />
          <span>{autoRunning ? 'Running...' : 'Run auto-generation'}</span>
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {STATUS_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => handleStatusTabChange(tab)}
            className={status === tab ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ fontSize: '0.8rem' }}
            aria-current={status === tab ? 'true' : undefined}
          >
            {tab === 'all' ? 'All' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
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

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'hsl(var(--text-muted))' }}>Loading opportunities...</div>
      ) : items.length === 0 ? (
        <div className="glass-card" style={{ padding: '60px', textAlign: 'center' }}>
          <Lightbulb size={40} style={{ color: 'hsl(var(--text-muted) / 0.4)', marginBottom: '12px' }} />
          <h3 style={{ fontSize: '1.1rem', color: 'hsl(var(--text-secondary))', marginBottom: '8px' }}>No opportunities queued</h3>
          <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-muted))' }}>
            Sync a repository to detect post-worthy work, then come back here.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {items.map(opportunity => (
            <div key={opportunity._id} className="glass-card" style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ flexGrow: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, color: 'white' }}>{opportunity.title}</span>
                    <span className={`badge ${STATUS_BADGE[opportunity.status]}`} style={{ fontSize: '0.65rem' }}>{opportunity.status}</span>
                    {opportunity.metadata?.importance && (
                      <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>{opportunity.metadata.importance}</span>
                    )}
                  </div>
                  {opportunity.summary && (
                    <div style={{ fontSize: '0.85rem', color: 'hsl(var(--text-secondary))', marginBottom: '4px' }}>{opportunity.summary}</div>
                  )}
                  <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>
                    {repoName(opportunity.repositoryId)} | {opportunity.sourceType} | {formatDate(opportunity.createdAt)}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleGenerate(opportunity)}
                    disabled={busyId === opportunity._id}
                    className="btn btn-primary"
                    style={{ fontSize: '0.8rem', gap: '6px' }}
                  >
                    <Sparkles size={14} />
                    <span>{busyId === opportunity._id ? 'Generating...' : 'Generate drafts'}</span>
                  </button>
                  {SETTABLE_STATUSES.map(next => (
                    <button
                      key={next}
                      onClick={() => handleStatusChange(opportunity, next)}
                      disabled={busyId === opportunity._id || opportunity.status === next}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.8rem' }}
                    >
                      {SETTABLE_LABELS[next]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && total > items.length && (
        <p style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))', marginTop: '16px' }}>
          Showing the first {items.length} of {total} opportunities.
        </p>
      )}
    </div>
  );
};

export default Opportunities;
