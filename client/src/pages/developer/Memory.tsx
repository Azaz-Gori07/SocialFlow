import React, { useCallback, useEffect, useState } from 'react';
import { Archive, Pencil, Search, Brain, X, ChevronDown } from 'lucide-react';
import { api } from '../../services/api';

interface MemoryEntry {
  _id: string;
  category: string;
  key: string;
  value: string;
  items: string[];
  source: string;
  updatedAt: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  feature: 'Features',
  problem_solved: 'Problems Solved',
  milestone: 'Milestones',
  architecture: 'Architecture',
  tech_stack: 'Tech Stack',
  stage: 'Stage',
  history: 'History',
  custom: 'Custom'
};

function formatDate(value?: string): string {
  if (!value) return 'Unknown';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Unknown' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const Memory: React.FC = () => {
  const [repos, setRepos] = useState<Array<{ _id: string; fullName: string }>>([]);
  const [repoId, setRepoId] = useState('');
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [search, setSearch] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    api.developer
      .listRepositories()
      .then(res => {
        const items = res?.items ?? [];
        setRepos(items);
        setRepoId(prev => prev || (items[0]?._id ?? ''));
        if (items.length === 0) setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load repositories for memory', err);
        setError(err instanceof Error ? err.message : 'Could not load repositories.');
        setLoading(false);
      });
  }, []);

  const load = useCallback(async () => {
    if (!repoId) return;
    try {
      const res = await api.developer.listMemory({
        repositoryId: repoId,
        category: category || undefined,
        search: activeSearch || undefined
      });
      setEntries(res?.items ?? []);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not load memory.');
    } finally {
      setLoading(false);
    }
  }, [repoId, category, activeSearch]);

  useEffect(() => {
    const run = async () => {
      await load();
    };
    run();
  }, [load]);

  const grouped = entries.reduce<Record<string, MemoryEntry[]>>((acc, entry) => {
    (acc[entry.category] ??= []).push(entry);
    return acc;
  }, {});

  const handleSaveEdit = async (entry: MemoryEntry) => {
    const value = editValue.trim();
    if (!value) {
      setError('A memory entry cannot be empty.');
      return;
    }
    setBusyId(entry._id);
    setError('');
    setNotice('');
    try {
      await api.developer.updateMemory(entry._id, { value });
      setNotice('Memory entry updated.');
      setEditingId(null);
      setLoading(true);
      await load();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not update the memory entry.');
    } finally {
      setBusyId(null);
    }
  };

  const handleArchive = async (entry: MemoryEntry) => {
    if (!window.confirm(`Archive "${entry.value}"? It is hidden from generation until restored.`)) return;
    setBusyId(entry._id);
    setError('');
    setNotice('');
    try {
      await api.developer.archiveMemory(entry._id);
      setNotice('Memory entry archived.');
      setLoading(true);
      await load();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not archive the memory entry.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Filters Toolbar */}
      <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ minWidth: '220px' }}>
          <label htmlFor="dev-memory-repo" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
            Repository
          </label>
          <div style={{ position: 'relative' }}>
            <select
              id="dev-memory-repo"
              value={repoId}
              onChange={e => {
                setRepoId(e.target.value);
                setLoading(true);
              }}
              style={{
                width: '100%',
                height: '38px',
                paddingLeft: '12px',
                paddingRight: '30px',
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '0.825rem',
                color: '#111827',
                outline: 'none',
                cursor: 'pointer',
                appearance: 'none'
              }}
            >
              <option value="">Select a repository</option>
              {repos.map(r => (
                <option key={r._id} value={r._id}>{r.fullName}</option>
              ))}
            </select>
            <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
          </div>
        </div>

        <div style={{ minWidth: '180px' }}>
          <label htmlFor="dev-memory-category" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
            Category
          </label>
          <div style={{ position: 'relative' }}>
            <select
              id="dev-memory-category"
              value={category}
              onChange={e => {
                setCategory(e.target.value);
                setLoading(true);
              }}
              style={{
                width: '100%',
                height: '38px',
                paddingLeft: '12px',
                paddingRight: '30px',
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '0.825rem',
                color: '#111827',
                outline: 'none',
                cursor: 'pointer',
                appearance: 'none'
              }}
            >
              <option value="">All categories</option>
              {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
          </div>
        </div>

        <form
          style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexGrow: 1, minWidth: '220px' }}
          onSubmit={e => {
            e.preventDefault();
            setActiveSearch(search.trim());
            setLoading(true);
          }}
        >
          <div style={{ flexGrow: 1 }}>
            <label htmlFor="dev-memory-search" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
              Search Knowledge
            </label>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input
                id="dev-memory-search"
                style={{
                  width: '100%',
                  height: '38px',
                  paddingLeft: '34px',
                  paddingRight: '12px',
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '0.825rem',
                  color: '#111827',
                  outline: 'none'
                }}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search keys, values, problems..."
              />
            </div>
          </div>
          <button
            type="submit"
            style={{
              height: '38px',
              padding: '0 16px',
              background: '#18181b',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.825rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Search
          </button>
          {activeSearch && (
            <button
              type="button"
              style={{
                height: '38px',
                padding: '0 12px',
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                color: '#6b7280',
                cursor: 'pointer'
              }}
              onClick={() => {
                setSearch('');
                setActiveSearch('');
              }}
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </form>
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
          Loading repository memory...
        </div>
      ) : !repoId ? (
        <div className="card" style={{ padding: '60px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '4px' }}>
            <Brain size={28} style={{ color: '#71717a' }} />
          </div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#111827', margin: 0 }}>
            No repository selected
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#6b7280', maxWidth: '380px', lineHeight: 1.5, margin: 0 }}>
            Memory is stored per repository. Mirror a repository from the Repositories tab first.
          </p>
        </div>
      ) : entries.length === 0 ? (
        <div className="card" style={{ padding: '60px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '4px' }}>
            <Brain size={28} style={{ color: '#b45309' }} />
          </div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#111827', margin: 0 }}>
            No memory entries recorded
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#6b7280', maxWidth: '380px', lineHeight: 1.5, margin: 0 }}>
            {activeSearch || category ? 'No entries match the current filters.' : 'Sync this repository to build memory facts and architectural knowledge.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          {Object.entries(grouped).map(([grp, grpEntries]) => (
            <div key={grp} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                paddingLeft: '4px'
              }}>
                {CATEGORY_LABELS[grp] ?? grp} ({grpEntries.length})
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {grpEntries.map(entry => (
                  <div key={entry._id} className="card" style={{ padding: '18px 22px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                      <div style={{ flexGrow: 1, minWidth: '240px' }}>
                        {editingId === entry._id ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>
                              Edit Knowledge Fact
                            </label>
                            <textarea
                              className="form-input"
                              style={{ minHeight: '80px', fontSize: '0.875rem', resize: 'vertical' }}
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              maxLength={2000}
                            />
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                type="button"
                                onClick={() => handleSaveEdit(entry)}
                                disabled={busyId === entry._id}
                                className="btn btn-primary"
                                style={{ fontSize: '0.8rem', padding: '6px 14px' }}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="btn btn-secondary"
                                style={{ fontSize: '0.8rem', padding: '6px 14px' }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ fontSize: '0.925rem', fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
                              {entry.value}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '8px' }}>
                              Key: <code>{entry.key}</code> • Source: {entry.source} • Updated {formatDate(entry.updatedAt)}
                            </div>
                            {entry.items && entry.items.length > 0 && (
                              <ul style={{ paddingLeft: '18px', fontSize: '0.8rem', color: '#4b5563', margin: 0 }}>
                                {entry.items.map((item, i) => <li key={i}>{item}</li>)}
                              </ul>
                            )}
                          </>
                        )}
                      </div>

                      {editingId !== entry._id && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(entry._id);
                              setEditValue(entry.value);
                            }}
                            className="btn btn-secondary"
                            style={{ fontSize: '0.78rem', gap: '6px', padding: '6px 12px' }}
                          >
                            <Pencil size={13} />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleArchive(entry)}
                            disabled={busyId === entry._id}
                            style={{
                              padding: '6px 12px',
                              background: '#ffffff',
                              border: '1px solid #e5e7eb',
                              borderRadius: '8px',
                              fontSize: '0.78rem',
                              fontWeight: 500,
                              color: '#ef4444',
                              cursor: busyId === entry._id ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                          >
                            <Archive size={13} />
                            <span>Archive</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
};

export default Memory;
