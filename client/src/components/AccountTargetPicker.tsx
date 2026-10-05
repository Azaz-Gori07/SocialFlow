import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, RefreshCw, Search, Star, X } from 'lucide-react';
import { api } from '../services/api';
import { FANOUT_CONFIRM_THRESHOLD } from '../config/publishing';

/**
 * "Publish To" account selector for account-level publishing targeting.
 *
 * - Groups usable (active + connected) accounts by platform, in the order of
 *   `platforms`.
 * - Preselects `publishDefault` accounts once per mount (defaults are a
 *   convenience for NEW content, never a silent "publish everywhere").
 * - Explicit "Select all" (no silent default), live count, search for large
 *   account sets, and a confirmation step at >= FANOUT_CONFIRM_THRESHOLD.
 * - Fully controlled: the parent owns `selected`; `fanoutOk` must gate the
 *   schedule/publish button and is sent as `confirmFanout`.
 */

interface Account {
  _id: string;
  platform: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  status: string;
  connectionStatus: string;
  publishDefault?: boolean;
}

export interface AccountTargetPickerProps {
  /** Platforms to show, in display order. Only matching accounts are listed. */
  platforms: string[];
  /** Controlled selection (SocialAccount _ids). */
  selected: string[];
  /** Reports the selection and whether the fan-out gate is satisfied. */
  onChange: (ids: string[], fanoutOk: boolean) => void;
  /** Section heading, default "Publish to". */
  label?: string;
}

const PLATFORM_META: Record<string, { label: string; color: string }> = {
  twitter: { label: 'X (Twitter)', color: '#1d9bf0' },
  instagram: { label: 'Instagram', color: '#e1306c' },
  facebook: { label: 'Facebook', color: '#1877f2' },
  linkedin: { label: 'LinkedIn', color: '#0a66c2' },
  youtube: { label: 'YouTube', color: '#ff0000' },
  threads: { label: 'Threads', color: '#101010' }
};

const usable = (a: Account) => a.status === 'active' && a.connectionStatus === 'connected';

export const AccountTargetPicker: React.FC<AccountTargetPickerProps> = ({
  platforms,
  selected,
  onChange,
  label = 'Publish to'
}) => {
  const [accounts, setAccounts] = useState<Account[] | null>(null); // null = loading
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [fanoutConfirmed, setFanoutConfirmed] = useState(false);
  const defaultsApplied = useRef(false);

  const load = async () => {
    try {
      setError('');
      const list = await api.social.getAccounts();
      setAccounts(Array.isArray(list) ? list : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load accounts');
      setAccounts([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Preselect default-publishing accounts exactly once, never overwriting a
  // selection the user already made.
  useEffect(() => {
    if (defaultsApplied.current || !accounts) return;
    defaultsApplied.current = true;
    if (selected.length > 0) return;
    const defaults = accounts
      .filter((a) => a.publishDefault && platforms.includes(a.platform) && usable(a))
      .map((a) => a._id);
    if (defaults.length > 0) {
      setFanoutConfirmed(defaults.length < FANOUT_CONFIRM_THRESHOLD);
      onChange(defaults, defaults.length < FANOUT_CONFIRM_THRESHOLD);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

  const commit = (ids: string[], confirmed: boolean) => {
    setFanoutConfirmed(confirmed);
    onChange(ids, confirmed);
  };

  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    // Any selection change re-opens the gate for large fan-outs.
    commit(next, next.length < FANOUT_CONFIRM_THRESHOLD);
  };

  const visible = useMemo(() => {
    if (!accounts) return [];
    const q = query.trim().toLowerCase();
    return accounts.filter(
      (a) =>
        platforms.includes(a.platform) &&
        usable(a) &&
        (!q || a.username.toLowerCase().includes(q) || a.displayName.toLowerCase().includes(q))
    );
  }, [accounts, platforms, query]);

  const connectedAll = useMemo(
    () => (accounts || []).filter((a) => platforms.includes(a.platform) && usable(a)),
    [accounts, platforms]
  );

  const selectAll = () => {
    const ids = connectedAll.map((a) => a._id);
    commit(ids, ids.length < FANOUT_CONFIRM_THRESHOLD);
  };

  const clearAll = () => commit([], true);

  const confirmFanout = () => commit(selected, true);

  const grouped = platforms.map((p) => ({
    platform: p,
    accounts: visible.filter((a) => a.platform === p)
  }));
  const needsSearch = connectedAll.length > 8;
  const showConfirm = selected.length >= FANOUT_CONFIRM_THRESHOLD && !fanoutConfirmed;

  const checkboxStyle = (checked: boolean): React.CSSProperties => ({
    width: '16px',
    height: '16px',
    borderRadius: '4px',
    border: checked ? 'none' : '1.5px solid #d1d5db',
    background: checked ? '#18181b' : '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  });

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '12px', background: '#ffffff' }}>
      {/* Header: label + count + bulk actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#18181b' }}>{label}</span>
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '999px',
              background: selected.length > 0 ? '#18181b' : '#f3f4f6',
              color: selected.length > 0 ? '#ffffff' : '#6b7280'
            }}
            data-testid="target-count"
          >
            {selected.length} accounts selected
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {needsSearch && (
            <div style={{ position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search accounts"
                style={{
                  width: '150px',
                  padding: '5px 8px 5px 24px',
                  fontSize: '0.75rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  outline: 'none'
                }}
              />
            </div>
          )}
          <button
            type="button"
            onClick={selectAll}
            disabled={connectedAll.length === 0}
            style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              padding: '5px 9px',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              background: '#ffffff',
              color: '#18181b',
              cursor: connectedAll.length === 0 ? 'not-allowed' : 'pointer'
            }}
          >
            Select all
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={selected.length === 0}
            style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              padding: '5px 9px',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              background: '#ffffff',
              color: selected.length === 0 ? '#9ca3af' : '#6b7280',
              cursor: selected.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <X size={11} /> Clear
          </button>
        </div>
      </div>

      {/* Loading / error / empty states */}
      {accounts === null && (
        <div style={{ fontSize: '0.78rem', color: '#6b7280', padding: '10px 4px' }}>Loading accounts…</div>
      )}
      {accounts !== null && error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#dc2626', padding: '8px 4px' }}>
          <span>{error}</span>
          <button
            type="button"
            onClick={load}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#18181b', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
          >
            <RefreshCw size={11} /> Retry
          </button>
        </div>
      )}
      {accounts !== null && !error && connectedAll.length === 0 && (
        <div style={{ fontSize: '0.78rem', color: '#6b7280', padding: '10px 4px' }}>
          No connected accounts yet. Connect an account first — nothing is ever published to every account silently.
        </div>
      )}

      {/* Platform groups */}
      {grouped.map(({ platform, accounts: list }) => {
        const meta = PLATFORM_META[platform] || { label: platform, color: '#6b7280' };
        return (
          <div key={platform} style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9ca3af', margin: '8px 0 4px' }}>
              {meta.label}
            </div>
            {list.length === 0 && (
              <div style={{ fontSize: '0.74rem', color: '#9ca3af', padding: '4px' }}>
                {query ? 'No matches.' : 'No connected accounts on this platform.'}
              </div>
            )}
            {list.map((a) => {
              const checked = selected.includes(a._id);
              return (
                <button
                  key={a._id}
                  type="button"
                  data-testid="target-account-row"
                  onClick={() => toggle(a._id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '7px 8px',
                    borderRadius: '8px',
                    border: 'none',
                    background: checked ? '#f4f4f5' : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <span style={checkboxStyle(checked)}>{checked && <Check size={11} color="#ffffff" strokeWidth={3} />}</span>
                  <span
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '999px',
                      background: a.avatarUrl ? `url(${a.avatarUrl}) center/cover` : `${meta.color}1a`,
                      color: meta.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      flexShrink: 0
                    }}
                  >
                    {!a.avatarUrl && (a.displayName || a.username || '?').charAt(0).toUpperCase()}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#18181b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {a.displayName || a.username}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>@{a.username}</span>
                  </span>
                  {a.publishDefault && (
                    <span
                      title="Default account — preselected for new content"
                      style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.65rem', fontWeight: 700, color: '#b45309', background: '#fef3c7', padding: '2px 6px', borderRadius: '999px' }}
                    >
                      <Star size={9} fill="#f59e0b" color="#f59e0b" /> Default
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}

      {/* Fan-out confirmation (>= threshold) */}
      {showConfirm && (
        <div
          data-testid="fanout-confirm"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            marginTop: '8px',
            padding: '9px 10px',
            borderRadius: '8px',
            background: '#fffbeb',
            border: '1px solid #fde68a'
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '0.76rem', color: '#92400e', fontWeight: 600 }}>
            <AlertTriangle size={14} color="#d97706" />
            You're about to publish this post to {selected.length} accounts.
          </span>
          <button
            type="button"
            onClick={confirmFanout}
            style={{
              fontSize: '0.74rem',
              fontWeight: 700,
              padding: '5px 12px',
              borderRadius: '8px',
              border: 'none',
              background: '#18181b',
              color: '#ffffff',
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            Confirm
          </button>
        </div>
      )}

      {/* Empty-selection hint for scheduling surfaces */}
      {selected.length === 0 && connectedAll.length > 0 && (
        <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '6px' }}>
          No accounts selected — choose at least one account to publish to.
        </div>
      )}
    </div>
  );
};

export default AccountTargetPicker;
