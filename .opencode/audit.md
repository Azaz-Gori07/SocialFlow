# SocialFlow — Audit Matrix (Phase 1 findings, before implementation)

Generated during the inspection phase. File:line references point at the pre-change code.

| Area | Current State | Problem | Severity | Required Fix |
| --- | --- | --- | --- | --- |
| Auth | JWT 15m/30d, stateless refresh, OTP activation | Refresh token not rotated/revocable; tokens returned in OAuth callback URL fragment (auth.controller.ts:105); refresh in JSON body; no logout invalidation | P1 | One-time auth-code exchange for OAuth callback; token rotation on refresh |
| Auth | socket.service.ts:6 | Hardcoded JWT secret fallback `'supersecret_socialflow_token_key_123!'` — token forgery if env missing | P0 | Remove fallback; require env secret |
| Auth | .env.example:2-3 | Committed example JWT secrets | P1 | Placeholders only; document generation |
| Social model | social.model.ts:17-45 | No `capabilities`, `status`, `lastSyncedAt`, `connectionStatus`, `scopes`, `providerParentAccountId`, `accountType`; tokens stored raw-encrypted but model exposes them | P1 | Full data model per guideline §5 |
| Social OAuth | social.service.ts:15-28, 125-139 | Encrypted-state-only validation (no server-side transaction, replay-able within 15 min, no PKCE at service level, no one-time consumption, no provider binding) | P0 | Server-side OAuth transaction store: nonce, user, provider, redirect URI, PKCE verifier, expiry, one-time use |
| Social OAuth | social.service.ts:75-78 | `Math.random()` followerCount/verified even on real OAuth | P0 | Remove; capabilities derived from real provider data |
| Social OAuth | provider.factory.ts:7-62 | MockSocialProvider fabricates codes, tokens, profiles, publish IDs (`mock_published_id_*`) | P0 | Delete mock provider; real providers only, hard error without credentials |
| Social OAuth | server.ts:133 + socialController.ts:20-82 | `POST /api/social/connect-direct` mock-account backdoor returns fake tokens + random follower counts | P0 | Remove endpoint + controller |
| Social OAuth | social.validation.ts:3-5 | Platform enum rejects facebook/instagram (missing providers) | P0 | Full provider enum + facebook/instagram providers |
| Social OAuth | linkedin.provider.ts:63 | Uses deprecated UGC Posts API instead of current Posts API | P1 | Migrate to Posts API v2 + media upload (asset URN) |
| Social OAuth | twitter.provider.ts | Real PKCE, but `offline.access` not always needed; no media upload; no posts list/get/delete | P2 | Extend interface + media upload |
| Social OAuth | oauth2.strategy.ts | No PKCE at base level; client_secret in body (fine for most, X uses Basic) | P2 | Provider-aware token exchange |
| Social OAuth | encryption.adapter.ts:8-10 | Key derived from JWT_SECRET when ENCRYPTION_KEY missing | P1 | Require ENCRYPTION_KEY in production; warn otherwise |
| Accounts | draft.publisher.ts:106, scheduler.ts:54 | `accounts[0]` silently chosen for publishing | P0 | Explicit destinationAccounts with socialAccountId |
| Publishing | post.model.ts:17-45 | Single `status`; no `deliveries[]`; platformContent overwritten with platform outputs (scheduler.ts:74); whole post fails if any platform fails | P0 | `deliveries[]` per destination; derived post status; idempotency key |
| Publishing | scheduler.ts:15-117 | No idempotency guard; no retry for failed posts; provider errors not normalized; no 429/5xx vs 4xx distinction | P0 | Idempotent per-delivery publishing, bounded exponential backoff, dead-letter, normalized error codes |
| Scheduler | scheduler.ts:157 + draft.publisher.ts:80-83 | Unified scheduler claims draft (status→publishing) then publisher bails (`status !== 'ready'`) — scheduled drafts never publish | P0 | Fix claim/publish contract |
| Scheduler | scheduler.ts:192-218 | 5-min stale-lock recovery can double-publish slow workers; no lease owner | P2 | Lease timestamp per claim |
| Workspace | workspace.routes.ts:58-64 + server.ts:136 | `PUT /api/workspace/role` registered twice → ERR_HTTP_HEADERS_SENT | P0 | Remove legacy duplicate |
| Workspace | post/draft/social/notification features | Not workspace-scoped; resources are per-user; members of workspace A/B share nothing but no workspace isolation enforced | P1 | workspaceId on all resources + membership checks |
| Comments | comment feature | Local-only CRUD; replies never reach the platform; no provider sync; `accounts[0]`-free but no providerCommentId | P0 | Provider-backed sync (list/reply), providerCommentId |
| Analytics | aiController.ts:168-242 | Fake insights (`1.8x CTR`, `+15% Watch Time`) injected when AI unconfigured | P0 | Remove fake insights; real provider ingestion |
| Analytics | dashboardController.ts | Aggregates AnalyticsMetric (OK) but no ingestion path exists from providers; `Analytics.tsx:183` frontend invents clicks = followers*0.015 | P0 | Provider analytics ingestion pipeline (period-aware, source-tagged) |
| Analytics | Analytics.tsx:46-63 | "PDF" export = CSV blob labeled application/pdf; fake 1.5s delay | P0 | Real CSV + real PDF generation |
| AI | ai.service.ts:50-59, aiController.ts:65 | Fake `{legacy:'openai'}` responses; `Math.random()*100` regeneration variance; OpenRouter chat-completion response never parsed (`outputs` always `{}`) | P1 | Parse real OpenRouter responses; validate output; remove fake branches |
| AI | aiController.ts:118-142 | YouTube repurpose is fake ("Mock processing transcript") | P1 | Real transcript fetch (yt-dlp free API) or explicit not-supported state |
| Notifications | notification.service.ts:22-38 | `NotificationService.create` never called by producers; raw `db.notifications.create` everywhere → no socket push; hardcoded `{count:1}` in socket.service.ts:91 | P1 | Single creation path with socket emit; real unread count |
| Notifications | notification.types.ts:1-8 | `draft_published`/`draft_failed`/`comment` not in enum; schema lacks `metadata` (db.ts:106-112) | P1 | Align types + schema |
| Validation | post.routes.ts:51-55, notification.routes.ts, legacy routes | bulkSchedule unvalidated; notification routes unvalidated; legacy routes (ai/dashboard/repurpose) no zod | P1 | Zod everywhere |
| Security | server.ts:45-52 | CORS accepts any `*.vercel.app` origin | P1 | Explicit origin allowlist |
| Security | socket.service.ts:17 | Socket.IO CORS `*` | P1 | Match app CORS |
| Security | server.ts:102-107, 148-158 | `/api/test/limit`, `/cors-debug` exposed (cors-debug leaks env names) | P1 | Remove/restrict to dev |
| Repo | root node_modules + package.json | Legacy leftovers; nothing imports root deps | P1 | Remove root package.json/node_modules/lockfile |
| Repo | node_modules tracked in git (~12.4k files) | Massive repo bloat | P1 | `git rm -r --cached` + gitignore |
| Repo | server/data/*.json (empty) + notification_preferences.json (seed) | Dead legacy JSON data; seed prefs | P2 | Remove |
| Repo | server/test.ts, src/test.ts, testRequest.js (logs JWT_SECRET), test_oauth2.js, test-mongo-connection.js, verifyRateLimit.js, verify-p1-build.bat | Debug/test artifacts committed | P1 | Remove |
| Repo | client/.env tracked | Env file in git (URL only, still bad practice) | P1 | Untrack + ignore |
| Repo | none.md | Internal audit report committed | P2 | Remove from tracking |
| Code quality | db.ts:22-160 | Duplicate schemas ("KEEP SYNCED") that drift (missing indexes) | P1 | Single source of truth per model |
| Code quality | legacy controllers (auth/post/comment/dashboard/ai/social/workspace) | Mostly dead or duplicating features modules | P1 | Delete dead; keep dashboard (cleaned); rewrite ai |
| Tests | post.service.test.ts, post.scheduler.test.ts | Assert removed BullMQ behavior — fail against current code | P1 | Rewrite/remove |
| Frontend | App.tsx:46-71 | State-based "routing" (currentTab switch); URL never reflects page; back/forward broken | P0 | Real react-router routes |
| Frontend | api.ts | No timeout, no cancellation, no typed responses, brittle envelope unwrapping, no env fallback | P1 | Robust typed API client |
| Frontend | AuthContext.tsx + AuthCallback.tsx | Tokens in localStorage + URL fragment; `wsList[0]` selection | P1 | Remove fragment tokens (one-time code), explicit workspace selection |
| Frontend | Analytics.tsx:183 | Mock clicks column | P0 | Remove |
| Frontend | Scheduler.tsx:164-176, 459-465 | "Load 50+ Post Simulator" fabricates 52 fake posts | P0 | Remove |
| Frontend | DraftLibrary.tsx:494-498 | Stale `page` closure pagination bug | P1 | Fix |
| Frontend | ~534 inline styles, 100+ `any`, no shared components, 5× duplicated getPlatformIcon | Architecture | P1 | Shared components, types, CSS classes |
| Frontend | index.css | Dark-only theme, no toggle; broken `.animate-spin/.animate-pulse` classes; dead App.css | P1 | Full light/dark token system + toggle |
| Frontend | Accessibility | No aria labels, no focus styles, no reduced-motion, title-only nav | P1 | Full a11y pass |
| Frontend | Scheduler.tsx:63-74 | Debug console.log timezone block | P2 | Remove |
