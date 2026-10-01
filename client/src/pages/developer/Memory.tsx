import React, { useCallback, useEffect, useState } from 'react';
import { Archive, Pencil, Search, Brain, X } from 'lucide-react';
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
  problem_solved: 'Problems solved',
  milestone: 'Milestones',
  architecture: 'Architecture',
  tech_stack: 'Tech stack',
  stage: 'Stage',
  history: 'History',
  custom: 'Custom'
};

function formatDate(value?: string): string {
  if (!value) return 'Unknown';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Unknown' : d.toLocaleString();
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
        // No repositories to load from: stop the spinner so the empty state shows.
        if (items.length === 0) setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load repositories for memory', err);
        setError(err instanceof Error ? err.message : 'Could not load repositories.');
        setLoading(false);
      });
  }, []);

  // No setState before the first await: called from an effect, where
  // react-hooks/set-state-in-effect rejects synchronous state updates.
  // Handlers set the loading flag before triggering a reload.
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

  // Group client-side: the search endpoint returns {items,total} with no
  // `grouped` map, so grouping from items is the one shape that works for both.
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
    <div>
      <div className="header-bar">
        <div>
          <h1 className="page-title">Memory</h1>
          <p style={{ color: 'hsl(var(--text-secondary))', marginTop: '4px', fontSize: '0.95rem' }}>
            What the system has learned about a repository, derived only from detected work.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ minWidth: '240px' }}>
          <label htmlFor="dev-memory-repo" className="form-label" style={{ fontSize: '0.8rem' }}>Repository</label>
          <select
            id="dev-memory-repo"
            className="form-input"
            style={{ padding: '10px 14px', fontSize: '0.85rem' }}
            value={repoId}
            onChange={e => {
              setRepoId(e.target.value);
              setLoading(true);
            }}
          >
            <option value="">Select a repository</option>
            {repos.map(r => (
              <option key={r._id} value={r._id}>{r.fullName}</option>
            ))}
          </select>
        </div>
        <div style={{ minWidth: '200px' }}>
          <label htmlFor="dev-memory-category" className="form-label" style={{ fontSize: '0.8rem' }}>Category</label>
          <select
            id="dev-memory-category"
            className="form-input"
            style={{ padding: '10px 14px', fontSize: '0.85rem' }}
            value={category}
            onChange={e => {
              setCategory(e.target.value);
              setLoading(true);
            }}
          >
            <option value="">All categories</option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
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
            <label htmlFor="dev-memory-search" className="form-label" style={{ fontSize: '0.8rem' }}>Search</label>
            <input
              id="dev-memory-search"
              className="form-input"
              style={{ padding: '10px 14px', fontSize: '0.85rem' }}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search keys, values and items"
            />
          </div>
          <button type="submit" className="btn btn-secondary" style={{ fontSize: '0.8rem', gap: '6px' }} aria-label="Search memory">
            <Search size={14} />
            <span>Search</span>
          </button>
          {activeSearch && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem' }}
              onClick={() => {
                setSearch('');
                setActiveSearch('');
              }}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </form>
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
        <div style={{ padding: '60px', textAlign: 'center', color: 'hsl(var(--text-muted))' }}>Loading memory...</div>
      ) : !repoId ? (
        <div className="glass-card" style={{ padding: '60px', textAlign: 'center' }}>
          <Brain size={40} style={{ color: 'hsl(var(--text-muted) / 0.4)', marginBottom: '12px' }} />
          <h3 style={{ fontSize: '1.1rem', color: 'hsl(var(--text-secondary))', marginBottom: '8px' }}>No repository selected</h3>
          <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-muted))' }}>
            Memory is stored per repository. Mirror one from the Repositories tab first.
          </p>
        </div>
      ) : entries.length === 0 ? (
        <div className="glass-card" style={{ padding: '60px', textAlign: 'center' }}>
          <Brain size={40} style={{ color: 'hsl(var(--text-muted) / 0.4)', marginBottom: '12px' }} />
          <h3 style={{ fontSize: '1.1rem', color: 'hsl(var(--text-secondary))', marginBottom: '8px' }}>No memory entries</h3>
          <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-muted))' }}>
            {activeSearch || category ? 'No entries match the current filters.' : 'Sync this repository to build memory from its detected work.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {Object.entries(grouped).map(([group, groupEntries]) => (
            <div key={group}>
              <h2 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--text-muted))', marginBottom: '10px' }}>
                {CATEGORY_LABELS[group] ?? group} ({groupEntries.length})
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {groupEntries.map(entry => (
                  <div key={entry._id} className="glass-card" style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
                      <div style={{ flexGrow: 1, minWidth: 0 }}>
                        {editingId === entry._id ? (
                          <div>
                            <label htmlFor={`dev-memory-edit-${entry._id}`} className="form-label" style={{ fontSize: '0.8rem' }}>
                              Edit value
                            </label>
                            <textarea
                              id={`dev-memory-edit-${entry._id}`}
                              className="form-input"
                              style={{ minHeight: '80px', fontSize: '0.85rem' }}
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              maxLength={2000}
                            />
                            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                              <button onClick={() => handleSaveEdit(entry)} disabled={busyId === entry._id} className="btn btn-primary" style={{ fontSize: '0.8rem' }}>
                                Save
                              </button>
                              <button onClick={() => setEditingId(null)} className="btn btn-secondary" style={{ fontSize: '0.8rem' }}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ fontWeight: 600, color: 'white', marginBottom: '4px' }}>{entry.value}</div>
                            <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', marginBottom: '8px' }}>
                              {entry.key} | source: {entry.source} | updated {formatDate(entry.updatedAt)}
                            </div>
                            {entry.items.length > 0 && (
                              <ul style={{ paddingLeft: '18px', fontSize: '0.8rem', color: 'hsl(var(--text-secondary))' }}>
                                {entry.items.map((item, i) => <li key={i}>{item}</li>)}
                              </ul>
                            )}
                          </>
                        )}
                      </div>
                      {editingId !== entry._id && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => {
                              setEditingId(entry._id);
                              setEditValue(entry.value);
                            }}
                            className="btn btn-secondary"
                            style={{ fontSize: '0.8rem', gap: '6px' }}
                            aria-label={`Edit memory entry ${entry.key}`}
                          >
                            <Pencil size={14} />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => handleArchive(entry)}
                            disabled={busyId === entry._id}
                            className="btn btn-danger"
                            style={{ fontSize: '0.8rem', gap: '6px' }}
                            aria-label={`Archive memory entry ${entry.key}`}
                          >
                            <Archive size={14} />
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
