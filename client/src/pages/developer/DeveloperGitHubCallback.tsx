import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';

/**
 * Landing page for the developer GitHub OAuth handshake.
 *
 * The server builds the authorize URL without a redirect_uri
 * (server/src/features/developer/github/github.oauth.ts), so GitHub returns to
 * whichever callback URL is registered on the OAuth app. It must point at this
 * route for the handshake to complete. The page trades the code for a stored
 * connection, then closes itself and tells the opener window to refetch.
 */
export const DeveloperGitHubCallback: React.FC = () => {
  const [message, setMessage] = useState('Completing GitHub connection...');

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // Every setState below follows an await, so none run synchronously in
      // the effect body (react-hooks/set-state-in-effect).
      await Promise.resolve();

      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state');
      const error = params.get('error_description') || params.get('error');

      if (cancelled) return;

      if (error) {
        setMessage(`GitHub returned an error: ${error}`);
        return;
      }

      if (!code || !state) {
        setMessage('GitHub did not return the required authorization data.');
        return;
      }

      try {
        const res = await api.developer.completeGithubAuth(code, state);
        if (cancelled) return;
        setMessage(`Connected as ${res?.login || 'GitHub account'}. You can close this window.`);
        // Same-origin only: the opener is our own SPA, never a third party.
        if (window.opener) {
          window.opener.postMessage({ type: 'developer:github-connected' }, window.location.origin);
          window.setTimeout(() => window.close(), 1200);
        }
      } catch (err) {
        if (!cancelled) setMessage(err instanceof Error ? err.message : 'GitHub connection failed.');
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg-base)', color: 'var(--text-primary)', padding: '20px', textAlign: 'center' }}>
      <div>
        <h1 className="page-title" style={{ fontSize: '1.4rem', marginBottom: '12px' }}>Developer</h1>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{message}</div>
      </div>
    </div>
  );
};

export default DeveloperGitHubCallback;
