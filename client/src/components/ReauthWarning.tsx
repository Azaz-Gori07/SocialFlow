import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { api } from '../services/api';

/**
 * App-level warning for connected social accounts whose login has expired.
 * The server flags accounts as `connectionStatus: 'expired'` whenever a token
 * refresh or a publish attempt hits an auth failure (or the stored token can
 * no longer be decrypted). This card polls lightly and surfaces the nudge on
 * top of every main screen until the user reconnects or dismisses it.
 */

interface AccountLike {
  _id: string;
  platform: string;
  username: string;
  connectionStatus?: string;
  status?: string;
}

const DISMISS_KEY = 'socialflow-reauth-dismissed';

function readDismissed(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

const isExpired = (a: AccountLike) => a.connectionStatus === 'expired' || a.status === 'error';

export const ReauthWarning: React.FC<{ active?: boolean }> = ({ active = true }) => {
  const navigate = useNavigate();
  const [expired, setExpired] = useState<AccountLike[]>([]);
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const load = async (force = false) => {
      try {
        const list = (await api.social.getAccounts({ force })) as AccountLike[];
        if (!cancelled) setExpired((list || []).filter(isExpired));
      } catch {
        // Purely informative surface — stay silent on failure.
      }
    };

    load();
    const interval = window.setInterval(() => load(true), 60_000);
    const onFocus = () => load(true);
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [active]);

  const visible = useMemo(
    () => expired.filter(a => !dismissed.includes(a._id)),
    [expired, dismissed]
  );

  const dismissAll = () => {
    const merged = Array.from(new Set([...dismissed, ...expired.map(a => a._id)]));
    setDismissed(merged);
    localStorage.setItem(DISMISS_KEY, JSON.stringify(merged));
  };

  if (!active || visible.length === 0) return null;

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        top: '14px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1200,
        width: 'min(520px, calc(100vw - 32px))',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '14px 16px',
        background: '#fffbeb',
        border: '1px solid #fde68a',
        borderRadius: '12px',
        boxShadow: '0 8px 30px rgba(180, 83, 9, 0.15)',
      }}
    >
      <span
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          background: '#fef3c7',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <AlertTriangle size={17} color="#b45309" />
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#92400e', lineHeight: 1.3 }}>
          Login expired
        </div>
        <div style={{ fontSize: '0.78rem', color: '#a16207', lineHeight: 1.45, marginTop: '2px' }}>
          {visible.length === 1
            ? `Connected account @${visible[0].username} (${visible[0].platform}) can no longer publish — please log in again.`
            : `${visible.length} connected accounts can no longer publish — please log in again.`}
        </div>
        {visible.length > 1 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
            {visible.map(a => (
              <span
                key={a._id}
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  color: '#92400e',
                  background: '#fef3c7',
                  border: '1px solid #fde68a',
                  borderRadius: '9999px',
                  padding: '2px 8px',
                }}
              >
                {a.platform} · @{a.username}
              </span>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => navigate('/connected-accounts')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '10px',
            padding: '7px 14px',
            background: '#18181b',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={13} />
          Reconnect now
        </button>
      </div>

      <button
        type="button"
        aria-label="Dismiss re-login warning"
        onClick={dismissAll}
        style={{
          background: 'none',
          border: 'none',
          color: '#a16207',
          cursor: 'pointer',
          padding: '4px',
          borderRadius: '6px',
          display: 'flex',
          flexShrink: 0,
        }}
      >
        <X size={15} />
      </button>
    </div>
  );
};

export default ReauthWarning;
