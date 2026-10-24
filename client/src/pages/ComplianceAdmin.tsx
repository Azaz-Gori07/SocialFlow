import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { ShieldAlert, CheckCircle, Plus, Trash2, RotateCcw } from 'lucide-react';
import { GenericSkeleton } from '../components/Skeleton';

interface ComplianceCheck {
  _id: string;
  sourceType: string;
  sourceId: string;
  status: 'passed' | 'flagged' | 'blocked';
  policyIssues: string[];
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

interface CustomRule {
  _id: string;
  name: string;
  description?: string;
  matchType: 'keyword' | 'regex';
  pattern: string;
  action: 'block' | 'review';
  isActive: boolean;
  createdAt: string;
}

interface ComplianceMetrics {
  totalChecks: number;
  blockedCount: number;
  flaggedCount: number;
  passedCount: number;
  activeRulesCount: number;
}

interface ComplianceDigest {
  pendingReviewCount: number;
  recentBlockedCount: number;
  dateKey: string;
}

export const ComplianceAdmin: React.FC = () => {
  const [metrics, setMetrics] = useState<ComplianceMetrics | null>(null);
  const [digest, setDigest] = useState<ComplianceDigest | null>(null);
  const [checks, setChecks] = useState<ComplianceCheck[]>([]);
  const [rules, setRules] = useState<CustomRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // New rule state
  const [newRule, setNewRule] = useState({
    name: '',
    matchType: 'keyword' as 'keyword' | 'regex',
    pattern: '',
    action: 'block' as 'block' | 'review'
  });
  const [creatingRule, setCreatingRule] = useState(false);

  const loadData = async () => {
    try {
      const [m, d, c, r] = await Promise.all([
        api.compliance.getMetrics(),
        api.compliance.getDigest(),
        api.compliance.listChecks('limit=20'),
        api.compliance.listRules()
      ]);
      setMetrics(m);
      setDigest(d);
      setChecks(c.items || []);
      setRules(r || []);
    } catch (e) {
      console.error('Failed to load compliance data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleResolve = async (id: string, status: string) => {
    setResolvingId(id);
    try {
      await api.compliance.resolveCheck(id, { status, note: 'Reviewed via Compliance Console' });
      await loadData();
    } catch (e) {
      console.error('Resolve failed:', e);
    } finally {
      setResolvingId(null);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRule.name || !newRule.pattern) return;
    setCreatingRule(true);
    try {
      await api.compliance.createRule(newRule);
      setNewRule({ name: '', matchType: 'keyword', pattern: '', action: 'block' });
      await loadData();
    } catch (e) {
      console.error('Failed to create rule:', e);
    } finally {
      setCreatingRule(false);
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      await api.compliance.deleteRule(id);
      await loadData();
    } catch (e) {
      console.error('Failed to delete rule:', e);
    }
  };

  if (loading) {
    return <GenericSkeleton minHeight={320} />;
  }

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
          GOVERNANCE & TRUST
        </div>
        <h1 style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: '2.35rem',
          fontWeight: 700,
          color: '#111827',
          letterSpacing: '-0.02em',
          marginBottom: '4px',
          lineHeight: 1.15
        }}>
          Compliance & Safety Console
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.4 }}>
          Monitor automated content safety, resolve policy flags, and configure organization-wide custom rules.
        </p>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }} className="responsive-grid-4-col">
        <div className="card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>Total Checks</span>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#111827', marginTop: '4px' }}>
            {metrics?.totalChecks ?? 0}
          </div>
        </div>
        <div className="card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600, textTransform: 'uppercase' }}>Passed</span>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#059669', marginTop: '4px' }}>
            {metrics?.passedCount ?? 0}
          </div>
        </div>
        <div className="card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '0.75rem', color: '#d97706', fontWeight: 600, textTransform: 'uppercase' }}>Flagged for Review</span>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#d97706', marginTop: '4px' }}>
            {metrics?.flaggedCount ?? 0}
          </div>
        </div>
        <div className="card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 600, textTransform: 'uppercase' }}>Blocked Violations</span>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#dc2626', marginTop: '4px' }}>
            {metrics?.blockedCount ?? 0}
          </div>
        </div>
      </div>

      {/* Daily Digest Summary Banner */}
      {digest && (
        <div className="card" style={{ padding: '16px 20px', background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong style={{ fontSize: '0.875rem', color: '#0f172a' }}>Daily Executive Digest ({digest.dateKey})</strong>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '2px 0 0 0' }}>
              Pending administrative reviews: <strong>{digest.pendingReviewCount}</strong> · Recent blocked posts: <strong>{digest.recentBlockedCount}</strong>
            </p>
          </div>
        </div>
      )}

      {/* Custom Rules Config */}
      <div className="card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: '0 0 16px 0' }}>
          Custom Compliance Rules
        </h3>
        
        <form onSubmit={handleCreateRule} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr 1fr auto', gap: '10px', marginBottom: '20px', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Rule Name</label>
            <input
              type="text"
              placeholder="e.g. Block internal roadmap leaks"
              className="form-input"
              value={newRule.name}
              onChange={e => setNewRule({ ...newRule, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Match Type</label>
            <select
              className="form-input"
              value={newRule.matchType}
              onChange={e => setNewRule({ ...newRule, matchType: e.target.value as any })}
            >
              <option value="keyword">Keyword</option>
              <option value="regex">Regex</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Pattern</label>
            <input
              type="text"
              placeholder="e.g. project-secret"
              className="form-input"
              value={newRule.pattern}
              onChange={e => setNewRule({ ...newRule, pattern: e.target.value })}
              required
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Action</label>
            <select
              className="form-input"
              value={newRule.action}
              onChange={e => setNewRule({ ...newRule, action: e.target.value as any })}
            >
              <option value="block">Block</option>
              <option value="review">Review</option>
            </select>
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ height: '38px', display: 'flex', alignItems: 'center', gap: '6px' }}
            disabled={creatingRule}
          >
            <Plus size={14} />
            <span>Add Rule</span>
          </button>
        </form>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {rules.length === 0 ? (
            <div style={{ fontSize: '0.8rem', color: '#9ca3af', textAlign: 'center', padding: '16px' }}>
              No custom rules configured yet. Standard safety gates apply.
            </div>
          ) : (
            rules.map(r => (
              <div
                key={r._id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 14px',
                  background: '#f9fafb',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb'
                }}
              >
                <div>
                  <strong style={{ fontSize: '0.85rem', color: '#111827' }}>{r.name}</strong>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: '10px' }}>
                    [{r.matchType.toUpperCase()}: <code>{r.pattern}</code>] → <strong>{r.action.toUpperCase()}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteRule(r._id)}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                  title="Delete Rule"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Flagged and Blocked Review Queue */}
      <div className="card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: '0 0 16px 0' }}>
          Audit & Review Queue ({checks.length})
        </h3>

        {checks.length === 0 ? (
          <div style={{ padding: '36px', textAlign: 'center', color: '#10b981', fontSize: '0.85rem' }}>
            No compliance issues found. All items clear.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {checks.map(c => (
              <div
                key={c._id}
                style={{
                  padding: '14px 18px',
                  background: c.status === 'blocked' ? '#fef2f2' : '#fffbeb',
                  border: `1px solid ${c.status === 'blocked' ? '#fecaca' : '#fde68a'}`,
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '99px',
                      textTransform: 'uppercase',
                      background: c.status === 'blocked' ? '#fee2e2' : '#fef3c7',
                      color: c.status === 'blocked' ? '#991b1b' : '#92400e'
                    }}>
                      {c.status}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      Source: {c.sourceType} ({c.sourceId}) · {new Date(c.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.825rem', color: '#1f2937' }}>
                    Issues: {c.policyIssues?.join(', ') || 'Triggered compliance filter'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {c.status !== 'passed' && (
                    <button
                      type="button"
                      onClick={() => handleResolve(c._id, 'passed')}
                      disabled={resolvingId === c._id}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '6px 12px', color: '#059669' }}
                    >
                      {resolvingId === c._id ? <RotateCcw size={12} className="animate-spin" /> : <CheckCircle size={13} />}
                      <span>Clear / Pass</span>
                    </button>
                  )}
                  {c.status !== 'blocked' && (
                    <button
                      type="button"
                      onClick={() => handleResolve(c._id, 'blocked')}
                      disabled={resolvingId === c._id}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '6px 12px', color: '#dc2626' }}
                    >
                      {resolvingId === c._id ? <RotateCcw size={12} className="animate-spin" /> : <ShieldAlert size={13} />}
                      <span>Block</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ComplianceAdmin;
