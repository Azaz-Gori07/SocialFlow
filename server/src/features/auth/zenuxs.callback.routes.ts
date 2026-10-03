import express from 'express';
import path from 'path';
import fs from 'fs';

/**
 * Serves the Zenuxs SDK callback page (`/callback.html`, the registered redirect
 * URI) and forwards the authorization code into SocialFlow's own server-side
 * callback.
 *
 * Why this exists
 * ---------------
 * The registered redirect URI is the SDK's `callback.html`, not SocialFlow's API
 * route. Two flows were previously mixed together:
 *
 *   - SocialFlow's server flow: the code and the PKCE verifier both live in the
 *     backend, so the backend can exchange them. This is the correct flow and is
 *     what actually logs a user in.
 *   - The SDK's own page: it tries to exchange the code in the browser, which
 *     fails with `State mismatch` because the verifier was never in the browser.
 *
 * So this handler does not let the SDK exchange anything. It forwards the code to
 * the backend callback, which completes the login server-side, and returns the
 * user's session through SocialFlow's existing one-time-code mechanism — tokens
 * never touch the browser and never appear in a URL.
 */

const router = express.Router();

/** Resolved package root: package "exports" hides dist/ from require.resolve. */
const distDir = path.dirname(require.resolve('zenuxs-oauth'));

const escapeHtml = (s: string) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Minimal same-origin landing page the SDK is pointed at. It does not receive a
 * token; it simply returns the user to SocialFlow.
 */
function redirectToFrontend(frontendUrl: string, hash: string) {
  const path = `${frontendUrl.replace(/\/$/, '')}/auth/callback`;
  const target = hash ? `${path}#${hash}` : path;
  // A meta refresh plus a real link: no inline script, so the app-wide CSP
  // (script-src 'self') stays intact on this page.
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0;url=${escapeHtml(target)}">
<title>Signing you in &middot; SocialFlow</title>
<style>
 body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0b;color:#f4f4f5;
      font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
 .card{text-align:center;padding:32px;border:1px solid #27272a;border-radius:14px;background:#111113}
 h1{margin:0 0 8px;font-size:1rem;letter-spacing:-0.01em}
 p{margin:0;color:#a1a1aa;font-size:.9rem}
 a{display:inline-block;margin-top:16px;color:#f4f4f5}
</style></head>
<body><div class="card"><h1>Signing you in…</h1><p>Returning to SocialFlow.</p>
<p><a href="${escapeHtml(target)}">Continue now</a></p></div></body></html>`;
}

function failurePage(message: string, frontendUrl: string) {
  const back = `${frontendUrl.replace(/\/$/, '')}/`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign-in failed &middot; SocialFlow</title>
<style>
 body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0b;color:#f4f4f5;
      font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:24px}
 .card{max-width:32rem;border:1px solid #27272a;border-radius:14px;background:#111113;padding:32px}
 h1{margin:0 0 10px;font-size:1.05rem}
 p{margin:0 0 10px;color:#a1a1aa;line-height:1.6;font-size:.92rem}
 a{display:inline-block;margin-top:12px;padding:10px 18px;border-radius:8px;background:#f4f4f5;
   color:#09090b;text-decoration:none;font-weight:600;font-size:.9rem}
</style></head>
<body><div class="card"><h1>Could not complete sign-in</h1>
<p>${escapeHtml(message)}</p>
<a href="${back}">Back to sign in</a></div></body></html>`;
}

/**
 * GET /callback.html — the registered redirect URI.
 *
 * The provider sends `code`, `state`, `client_id` and `scope`. We forward them to
 * SocialFlow's backend callback, which owns the PKCE verifier and performs the
 * token exchange, then returns the one-time code the client already knows how to
 * redeem via POST /api/auth/exchange.
 */
router.get('/callback.html', async (req: any, res: any) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const backendUrl =
    process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;

  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const oauthError = typeof req.query.error === 'string' ? req.query.error : '';

  if (oauthError) {
    return res
      .status(400)
      .send(failurePage(`Zenuxs returned "${oauthError}" before sign-in completed.`, frontendUrl));
  }

  if (!code) {
    // No code: either the user cancelled or the link was opened directly.
    // Serve the SDK page so its own diagnostics remain available.
    res.removeHeader('Content-Security-Policy');
    return res.sendFile(path.join(distDir, 'callback.html'), (err: any) => {
      if (err) res.status(404).send(failurePage('This callback link is incomplete.', frontendUrl));
    });
  }

  // Forward to the backend callback that owns the verifier. Use a manual
  // redirect-follow so the backend's own redirect is surfaced rather than chased.
  const forward = new URL('/api/auth/oauth/zenuxs/browser/callback', backendUrl);
  forward.searchParams.set('code', code);
  if (state) forward.searchParams.set('state', state);

  try {
    const upstream = await fetch(forward.toString(), {
      redirect: 'manual',
      headers: { Accept: 'application/json' }
    });

    const location = upstream.headers.get('location') || '';

    if (upstream.status >= 300 && upstream.status < 400 && location) {
      // The backend already produced the final frontend redirect (hash code or an
      // error). Render a page that forwards the user there without exposing a
      // token in this server-rendered HTML.
      const parsed = new URL(location);
      // The backend's Location already points at the final frontend route
      // (e.g. http://localhost:5173/auth/callback#code=...). Pass only the
      // origin — passing pathname too produced /auth/callback/auth/callback.
      return res.send(redirectToFrontend(parsed.origin, parsed.hash.replace(/^#/, '')));
    }

    if (upstream.status >= 400) {
      let detail = 'The server could not complete the sign-in.';
      try {
        const body: any = await upstream.json();
        if (body?.message) detail = String(body.message);
      } catch {
        /* keep the generic message */
      }
      return res.status(400).send(failurePage(detail, frontendUrl));
    }

    return res.status(400).send(failurePage('The server returned an unexpected response.', frontendUrl));
  } catch (error: any) {
    return res
      .status(502)
      .send(failurePage(`Could not reach the SocialFlow sign-in service: ${error?.message || 'network error'}`, frontendUrl));
  }
});

/**
 * GET /zenux-oauth.js — the SDK browser bundle referenced by its callback page.
 * Served with the correct MIME type so the page can load it.
 */
router.get('/zenux-oauth.js', (_req: any, res: any, next: any) => {
  res.removeHeader('Content-Security-Policy');
  res.type('application/javascript').sendFile(path.join(distDir, 'zenux-oauth.js'), (err: any) => {
    if (err) next(err);
  });
});

export default router;