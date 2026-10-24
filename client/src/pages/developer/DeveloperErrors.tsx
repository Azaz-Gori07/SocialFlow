import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { Lightbulb, RefreshCw, AlertCircle } from 'lucide-react';
import { GenericSkeleton } from '../../components/Skeleton';

interface DeveloperError {
  _id: string;
  stage: string;
  message: string;
  repositoryId?: string;
  createdAt: string;
  stack?: string;
}

export const DeveloperErrors: React.FC = () => {
  const [errors, setErrors] = useState<DeveloperError[]>([]);
  const [hints, setHints] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const [errData, hintData] = await Promise.all([
        api.developer.getErrors(30),
        api.developer.getErrorHints()
      ]);
      setErrors(errData.items || []);
      setHints(hintData.hints || []);
    } catch (e) {
      console.error('Failed to load error dashboard:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return <GenericSkeleton minHeight={240} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827', margin: 0 }}>
            Developer Pipeline Errors & Avoidance Hints
          </h3>
          <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '4px 0 0 0' }}>
            Inspect sync errors, API rate limit drops, and AI-derived hints for preventing failures.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="btn btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}
          disabled={refreshing}
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {hints.length > 0 && (
        <div className="card" style={{ padding: '16px 20px', background: '#eff6ff', border: '1px solid #bfdbfe' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#1d4ed8' }}>
            <Lightbulb size={16} />
            <strong style={{ fontSize: '0.85rem' }}>AI Avoidance & Diagnostic Hints</strong>
          </div>
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.8rem', color: '#1e40af', lineHeight: 1.5 }}>
            {hints.map((hint, idx) => (
              <li key={idx} style={{ marginBottom: '4px' }}>{hint}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card" style={{ padding: '20px' }}>
        <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#111827', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <AlertCircle size={15} style={{ color: '#ef4444' }} />
          <span>Recent Execution Failures ({errors.length})</span>
        </h4>

        {errors.length === 0 ? (
          <div style={{ padding: '36px', textAlign: 'center', color: '#10b981', fontSize: '0.85rem' }}>
            No recent errors recorded. Pipeline execution is healthy.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {errors.map(err => (
              <div
                key={err._id}
                style={{
                  padding: '12px 14px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  fontSize: '0.8rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: '#991b1b', fontWeight: 600 }}>
                  <span style={{ textTransform: 'uppercase', fontSize: '0.7rem', background: '#fee2e2', padding: '2px 6px', borderRadius: '4px' }}>
                    {err.stage}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 400 }}>
                    {new Date(err.createdAt).toLocaleString()}
                  </span>
                </div>
                <div style={{ color: '#b91c1c', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {err.message}
                </div>
                {err.stack && (
                  <pre style={{ margin: '8px 0 0 0', padding: '8px', background: '#ffffff', borderRadius: '4px', fontSize: '0.7rem', color: '#4b5563', overflowX: 'auto' }}>
                    {err.stack}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
