import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, KeyRound, Loader2, Send, Trash2 } from 'lucide-react';
import { api } from '../services/api';

/**
 * Unofficial X session panel.
 *
 * This is deliberately NOT a replica of X's sign-in screen: SocialFlow is
 * clearly identified, the risk is stated, and the password is forwarded once
 * to the bridge (never stored). The session is only used when X's official API
 * answers 402 credits-depleted.
 */
export const XSessionPanel: React.FC<{
  account: any;
  onChanged: () => Promise<void> | void;
  onMessage: (message: string) => void;
}> = ({ account, onChanged, onMessage }) => {
  const [mode, setMode] = useState<'cookies' | 'password'>('cookies');
  const [authToken, setAuthToken] = useState('');
  const [ct0, setCt0] = useState('');
  const [username, setUsername] = useState(account.username || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmingTest, setConfirmingTest] = useState(false);
  const [testUrl, setTestUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const status = account.xSession || { connected: false };
  const connected = status.connected === true;

  const run = async (fn: () => Promise<any>, successMessage: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      onMessage(successMessage);
      await onChanged();
      return result;
    } catch (err: any) {
      setError(err?.message || 'Something went wrong');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleConnect = async () => {
    const result =
      mode === 'cookies'
        ? await run(
            () =>
              api.social.xSession.connect(account._id, {
                mode: 'cookies',
                authToken: authToken.trim(),
                ct0: ct0.trim(),
              }),
            `✅ X session connected for @${account.username}.`
          )
        : await run(
            () =>
              api.social.xSession.connect(account._id, {
                mode: 'password',
                username: username.trim(),
                email: email.trim() || undefined,
                password,
                totpSecret: totpSecret.trim() || undefined,
              }),
            `✅ Signed in to X for @${account.username}.`
          );

    if (result) {
      setAuthToken('');
      setCt0('');
      setPassword('');
      setTotpSecret('');
    }
  };

  const handleDisconnect = async () => {
    await run(async () => {
      await api.social.xSession.disconnect(account._id);
      api.social.invalidateAccounts();
      setTestUrl(null);
      return true;
    }, '🗑️ X session removed. Official OAuth publishing is unchanged.');
  };

  const handleTest = async () => {
    if (!confirmingTest) {
      setConfirmingTest(true);
      window.setTimeout(() => setConfirmingTest(false), 4000);
      return;
    }
    setConfirmingTest(false);
    const result = await run(
      () => api.social.xSession.test(account._id),
      '✅ Test tweet published through the X session.'
    );
    if (result?.externalPostUrl || result?.url) {
      setTestUrl(result.externalPostUrl || result.url);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '0.8rem',
    color: '#111827',
    background: '#ffffff',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.7rem',
    fontWeight: 700,
    color: '#374151',
    display: 'block',
    marginBottom: '4px',
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 10px',
    borderRadius: '7px',
    border: active ? '1px solid #d6d3d1' : '1px solid transparent',
    background: active ? '#ffffff' : 'transparent',
    color: active ? '#111827' : '#6b7280',
    fontSize: '0.72rem',
    fontWeight: 700,
    cursor: 'pointer',
  });

  return (
    <div
      style={{
        margin: '2px 0 6px 0',
        padding: '14px 16px',
        background: '#fafaf9',
        border: '1px solid #e7e5e4',
        borderRadius: '10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <KeyRound size={15} style={{ color: '#57534e' }} />
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827' }}>
          Unofficial X session
        </div>
        <span
          style={{
            fontSize: '0.62rem',
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: connected ? '#047857' : '#9a3412',
            background: connected ? '#ecfdf5' : '#fff7ed',
            border: `1px solid ${connected ? '#a7f3d0' : '#fed7aa'}`,
            borderRadius: '999px',
            padding: '2px 8px',
          }}
        >
          {connected ? 'connected' : 'not connected'}
        </span>
      </div>

      <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: 0, lineHeight: 1.5 }}>
        Fallback used only when X's official API rejects a post with{' '}
        <strong>402 credits-depleted</strong>. It talks to X's internal web API (twikit), which
        violates X's Terms — the account can be rate-limited, locked or suspended. Official OAuth
        stays primary and is untouched.
      </p>

      {connected ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '0.75rem', color: '#374151', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <span style={{ color: '#047857', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle2 size={12} /> {status.method === 'password' ? 'Signed in via X login' : 'Cookies imported'}
            </span>
            {status.connectedAt && <span>connected {new Date(status.connectedAt).toLocaleString()}</span>}
            {status.lastUsedAt && <span>last used {new Date(status.lastUsedAt).toLocaleString()}</span>}
          </div>

          {status.lastError && (
            <div style={{ fontSize: '0.72rem', color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '7px', padding: '6px 9px' }}>
              {status.lastError}
            </div>
          )}

          {testUrl && (
            <a
              href={testUrl}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: '0.72rem', color: '#1d4ed8', fontWeight: 600, wordBreak: 'break-all' }}
            >
              {testUrl}
            </a>
          )}

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleTest}
              disabled={busy}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 11px',
                borderRadius: '8px',
                border: '1px solid #111827',
                background: confirmingTest ? '#fef2f2' : '#111827',
                color: confirmingTest ? '#b91c1c' : '#ffffff',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: busy ? 'wait' : 'pointer',
              }}
              title="Publishes one real tweet from this account"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              {confirmingTest ? 'Click again to post' : 'Send test tweet'}
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={busy}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 11px',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                background: '#ffffff',
                color: '#6b7280',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: busy ? 'wait' : 'pointer',
              }}
            >
              <Trash2 size={12} /> Remove session
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '4px', background: '#f5f5f4', borderRadius: '9px', padding: '3px', alignSelf: 'flex-start' }}>
            <button type="button" style={tabStyle(mode === 'cookies')} onClick={() => setMode('cookies')}>
              Paste cookies (safer)
            </button>
            <button type="button" style={tabStyle(mode === 'password')} onClick={() => setMode('password')}>
              X username &amp; password
            </button>
          </div>

          {mode === 'cookies' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <ol style={{ fontSize: '0.7rem', color: '#6b7280', margin: 0, paddingLeft: '16px', lineHeight: 1.6 }}>
                <li>Open x.com in this browser while signed in.</li>
                <li>DevTools → Application → Cookies → https://x.com.</li>
                <li>Copy <code>auth_token</code> and <code>ct0</code> below. These are session keys, not your password.</li>
              </ol>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={labelStyle}>auth_token</label>
                  <input
                    type="password"
                    autoComplete="off"
                    value={authToken}
                    onChange={e => setAuthToken(e.target.value)}
                    placeholder="a1b2c3…"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>ct0</label>
                  <input
                    type="password"
                    autoComplete="off"
                    value={ct0}
                    onChange={e => setCt0(e.target.value)}
                    placeholder="csrf token"
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={labelStyle}>X username or email</label>
                  <input
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Email or phone (optional)</label>
                  <input
                    type="text"
                    autoComplete="off"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={labelStyle}>X password</label>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>2FA secret (only if enabled)</label>
                  <input
                    type="password"
                    autoComplete="off"
                    value={totpSecret}
                    onChange={e => setTotpSecret(e.target.value)}
                    placeholder="base32 secret"
                    style={inputStyle}
                  />
                </div>
              </div>
              <p style={{ fontSize: '0.7rem', color: '#9a3412', margin: 0, lineHeight: 1.45 }}>
                <AlertTriangle size={11} style={{ verticalAlign: '-1px', marginRight: '3px' }} />
                The password is forwarded once to the bridge for X's login and is never stored or
                logged. If X shows a captcha or asks for more verification, use cookies instead.
              </p>
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={handleConnect}
              disabled={
                busy ||
                (mode === 'cookies' ? authToken.trim().length < 20 || ct0.trim().length < 20 : !password || !username.trim())
              }
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 13px',
                borderRadius: '8px',
                border: 'none',
                background: '#111827',
                color: '#ffffff',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: busy ? 'wait' : 'pointer',
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
              {mode === 'cookies' ? 'Connect session' : 'Sign in via bridge'}
            </button>
          </div>
        </>
      )}

      {error && (
        <div style={{ fontSize: '0.72rem', color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '7px', padding: '7px 9px', lineHeight: 1.45 }}>
          {error}
        </div>
      )}
    </div>
  );
};

export default XSessionPanel;
