import React, { useCallback, useEffect, useState } from 'react';
import { 
  Lightbulb, 
  Play, 
  Sparkles, 
  FolderGit2, 
  Clock 
} from 'lucide-react';
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

const SETTABLE_LABELS: Record<(typeof SETTABLE_STATUSES)[number], string> = {
  pending: 'Move to pending',
  skipped: 'Skip',
  rejected: 'Reject'
};

function formatDate(value?: string): string {
  if (!value) return 'Unknown';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Unknown' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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

  const repoName = (id: string) => repos.find(r => r._id === id)?.fullName ?? 'Repository';

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Action Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          Development work detected by AI and queued for social draft generation.
        </div>

        <button
          type="button"
          onClick={handleAutoRun}
          disabled={autoRunning}
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
            cursor: autoRunning ? 'not-allowed' : 'pointer',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
          }}
        >
          <Play size={14} />
          <span>{autoRunning ? 'Running Generator...' : 'Run Auto-Generation'}</span>
        </button>
      </div>

      {/* Status Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {STATUS_TABS.map(tab => {
          const isActive = status === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => handleStatusTabChange(tab)}
              style={{
                padding: '6px 14px',
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
            >
              {tab === 'all' ? 'All Opportunities' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          );
        })}
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

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px', color: '#9ca3af', fontSize: '0.875rem' }}>
          Loading opportunities...
        </div>
      ) : items.length === 0 ? (
        <div className="card" style={{ padding: '60px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '4px' }}>
            <Lightbulb size={28} style={{ color: '#b45309' }} />
          </div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#111827', margin: 0 }}>
            No opportunities queued
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#6b7280', maxWidth: '380px', lineHeight: 1.5, margin: 0 }}>
            Sync a repository from the Repositories tab to detect post-worthy achievements and milestones.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {items.map(opportunity => (
            <div
              key={opportunity._id}
              className="card"
              style={{
                padding: '20px 24px',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '16px',
                flexWrap: 'wrap'
              }}
            >
              <div style={{ flexGrow: 1, minWidth: '240px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827' }}>
                    {opportunity.title}
                  </span>

                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    background: opportunity.status === 'generated' ? '#ecfdf5' : opportunity.status === 'pending' ? '#fef3c7' : '#f3f4f6',
                    color: opportunity.status === 'generated' ? '#059669' : opportunity.status === 'pending' ? '#b45309' : '#6b7280',
                    textTransform: 'capitalize'
                  }}>
                    {opportunity.status}
                  </span>

                  {opportunity.metadata?.importance && (
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: '#eff6ff',
                      color: '#2563eb'
                    }}>
                      {opportunity.metadata.importance}
                    </span>
                  )}
                </div>

                {opportunity.summary && (
                  <p style={{ fontSize: '0.85rem', color: '#4b5563', margin: '2px 0 8px 0', lineHeight: 1.5 }}>
                    {opportunity.summary}
                  </p>
                )}

                <div style={{ fontSize: '0.75rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <FolderGit2 size={12} />
                    <span>{repoName(opportunity.repositoryId)}</span>
                  </span>
                  <span>•</span>
                  <span>Source: {opportunity.sourceType}</span>
                  <span>•</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} />
                    <span>{formatDate(opportunity.createdAt)}</span>
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => handleGenerate(opportunity)}
                  disabled={busyId === opportunity._id}
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
                    cursor: busyId === opportunity._id ? 'not-allowed' : 'pointer',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                  }}
                >
                  <Sparkles size={14} />
                  <span>{busyId === opportunity._id ? 'Generating...' : 'Generate Drafts'}</span>
                </button>

                {SETTABLE_STATUSES.map(next => (
                  <button
                    key={next}
                    type="button"
                    onClick={() => handleStatusChange(opportunity, next)}
                    disabled={busyId === opportunity._id || opportunity.status === next}
                    style={{
                      padding: '7px 12px',
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      fontWeight: 500,
                      color: opportunity.status === next ? '#9ca3af' : '#374151',
                      cursor: busyId === opportunity._id || opportunity.status === next ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {SETTABLE_LABELS[next]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && total > items.length && (
        <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '8px', textAlign: 'center' }}>
          Showing the first {items.length} of {total} opportunities.
        </p>
      )}

    </div>
  );
};

export default Opportunities;
