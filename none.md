# SocialFlow AI — Runtime Verification Report

**Date:** 2026-06-14  
**Mode:** Runtime verification against live deployed application + database state  
**Backend:** `https://socialflow-src9.onrender.com`  
**Environment:** production (Render)

---

## 1. Environment Variable Proof

Verification method: Read `.env` file directly + tested `ProviderFactory` resolution from compiled dist.

| Variable | Status | Value Characteristic | Effect |
|---|---|---|---|
| `X_CLIENT_ID` | **Present** | Real credentials (not mock/placeholder) | `TwitterProvider` with real OAuth + publish |
| `X_CLIENT_SECRET` | **Present** | Real credentials | Token exchange will work |
| `LINKEDIN_CLIENT_ID` | **Placeholder** | Starts with `your_` | `ProviderFactory` → **MockSocialProvider** |
| `LINKEDIN_CLIENT_SECRET` | **Placeholder** | Starts with `your_` | Mock token exchange |
| `GOOGLE_CLIENT_ID` | **Present** | Real credentials | `YouTubeProvider` with real OAuth |
| `GOOGLE_CLIENT_SECRET` | **Present** | Real credentials | Token exchange will work |
| `FACEBOOK_CLIENT_ID` | **Placeholder** | Mock value | No provider class exists |
| `FACEBOOK_CLIENT_SECRET` | **Placeholder** | Mock value | No provider class exists |
| `TIKTOK_CLIENT_ID` | **Placeholder** | Mock value | No provider class exists |
| `TIKTOK_CLIENT_SECRET` | **Placeholder** | Mock value | No provider class exists |
| `ENCRYPTION_KEY` | **Missing** | Falls back to `JWT_SECRET` hash | Encryption works via derived key |
| `JWT_SECRET` | **Present** | Custom value | Auth tokens + encryption key derivation |
| `MONGO_URI` | **Present** | MongoDB Atlas SRV | Connection confirmed |
| `REDIS_URL` | **Empty** | No value | Expected — Redis dependency removed |
| `FRONTEND_URL` | **Present** | `http://localhost:5173` | **WRONG for production** — should be Vercel URL |

**Provider Factory Resolution (runtime from compiled dist):**
```
twitter:  clientId=Present (eGY1dUF6UE...) → isMock=false → Real TwitterProvider    ✓
linkedin: clientId=Present (your_linke...)  → isMock=true  → MockSocialProvider      ✗
youtube:  clientId=Present (6553044813...)  → isMock=false → Real YouTubeProvider     ✓
```

---

## 2. Database Proof

Verification method: Node.js script using Mongoose connected to MongoDB Atlas with Google DNS fallback (8.8.8.8, 1.1.1.1).

### Collections Present
```
analyticsmetrics, workspacemembers, notificationpreferences, users, activitylogs,
workspaces, drafts, comments, publishhistories, notifications, aigenerations,
socialaccounts, posts, growthinsights, otps
```

### SocialAccounts (1 document)
| Field | Value | Status |
|---|---|---|
| `_id` | `6a2ea5228b517c07a0ff6bb0` | — |
| `platform` | `twitter` | — |
| `userId` | `6a2b010399b9594d7808523d` | Linked to user `azazgori76@gmail.com` |
| `username` | `developer_azaz` | Twitter handle |
| `accessToken` | 22 chars, NO colon separator | **NOT ENCRYPTED** ✗ |
| `token_encrypted` | `false` | **Mock token** — `mock_token_xxx` format |
| `token_len` | 22 | Expected encrypted length: ~160+ chars |
| `refreshToken` | Present | Also mock format |
| `expiresAt` | `2026-07-14T12:57:06.022Z` | 30-day mock expiry |

**PROOF: Token is mock/unencrypted**
```
Token value stored in DB: "mock_token_xxxxxxxxxxxx"
Encrypted format required: "hex_iv:hex_ciphertext" (length > 50)
```
→ The account was created via `POST /api/social/connect-direct` (legacy mock endpoint)  
→ **Not created via OAuth callback**  
→ `EncryptionAdapter.decrypt()` WILL CRASH on this token (throws "Invalid encrypted format")

### Posts (0 documents)
**No posts exist in the database.** The Post Scheduler has never created any posts.

### Drafts (1 document)
| Field | Value |
|---|---|
| `_id` | `6a2ea5a98b517c07a0ff6bb2` |
| `userId` | `6a2b010399b9594d7808523d` |
| `platform` | `twitter` |
| `status` | `draft` |
| `retryCount` | `0` |
| `lastAttemptAt` | `N/A` |

**PROOF: Draft never queued or published**
- Status is `draft` (not `ready`, not `publishing`, not `published`)
- `lastAttemptAt` is absent — never attempted
- Scheduler queries `{ status: 'ready' }` → **will never find this draft**

### PublishHistory (0 records)
**No publishing has ever been attempted.** Zero publish history records.

---

## 3. API Proof

All tests performed against live Render deployment `https://socialflow-src9.onrender.com`.

### 3.1 Health Endpoint
```
GET /health → 200 OK
{"status":"healthy","timestamp":"2026-06-14T13:55:47.046Z","env":"production"}
```
**WORKING** ✓

### 3.2 Login Endpoint
```
POST /api/auth/login → 500 Internal Server Error
{"success":false,"message":"An unexpected error occurred on the server",...}
```
Tested with two different user accounts (both return 500).  
**BROKEN** ✗ — The auth login endpoint crashes on production with a generic error.

### 3.3 OAuth Callback Endpoint
```
GET /api/social/callback/twitter?code=invalid_test&state=test_state
→ 302 Redirect to http://localhost:5173/settings?connection=error&...
```
**ROUTING WORKS** ✓ but **`FRONTEND_URL` is wrong** — redirects to `localhost:5173` instead of production frontend.

### 3.4 Zenuxs OAuth Redirect
```
GET /api/auth/oauth/zenuxs/google → 302 Redirect
→ https://api.auth.zenuxs.in/oauth/authorize?client_id=...&redirect_uri=http://localhost:5000/...
```
**REDIRECT WORKS** ✓ but **`BACKEND_URL` resolves to localhost** — the `redirect_uri` in the generated URL points to `http://localhost:5000`, not the Render URL. The Zenuxs OAuth callback will fail to reach the deployed backend.

### 3.5 Twitter OAuth URL Generation (runtime compiled)
```
$ twitter.getAuthorizationUrl("test_state_123", redirectUri)
→ https://twitter.com/i/oauth2/authorize?client_id=...&code_challenge=...&redirect_uri=...
```
**OAuth URL FORMAT VALID** ✓ — Contains all required PKCE parameters (`code_challenge`, `code_challenge_method=plain`, `client_id`, `redirect_uri`, `state`).

### 3.6 LinkedIn OAuth URL Generation (runtime compiled)
```
$ linkedin.getAuthorizationUrl("test_state_456", redirectUri)
→ https://www.linkedin.com/oauth/v2/authorization?scope=openid+profile+email+w_member_social&...
```
**SCOPE INCLUDES `w_member_social`** ✓ (after our fix). But this provider is never used because credentials are placeholders → **MockSocialProvider is returned instead**.

### 3.7 YouTube OAuth URL Generation (runtime compiled)
```
$ youtube.getAuthorizationUrl("test_state_789", redirectUri)
→ https://accounts.google.com/o/oauth2/v2/auth?access_type=offline&prompt=consent&...
```
**URL FORMAT VALID** ✓ — Contains `access_type=offline` and `prompt=consent` for refresh token support.

---

## 4. Encryption Proof

### 4.1 Attempt to Decrypt Stored Token
```
Input:    "mock_token_abc123"  (simulating the stored DB value)
Output:   Error: "Invalid encrypted format. Expected 'iv:ciphertext'"
```
**DECRYPTION FAILS** ✗ — The legacy mock token is not in `iv:ciphertext` format.

### 4.2 Encrypt/Decrypt Cycle with Real Token
```
Input:    "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.real_token_12345"
Encrypted: 161 chars, contains ":" separator
Decrypted: matches original → true
```
**ENCRYPTION/DECRYPTION WORKS** ✓ — But only for properly encrypted tokens.

### 4.3 Key Derivation
```
ENCRYPTION_KEY: Missing → derived from crypto.createHash("sha256").update(JWT_SECRET).digest()
```
**FALLBACK WORKS** ✓ — Deterministic key derived from JWT_SECRET.

---

## 5. Scheduler Proof

### 5.1 ProcessScheduledPosts Query
From source (services/scheduler.ts:17-20):
```
PostModel.find({ status: 'scheduled', scheduledAt: { $lte: now } })
```

**Database state:** 0 posts exist.  
**SCHEDULER HAS NOTHING TO PROCESS** — No scheduled posts in the database.

### 5.2 ProcessReadyDrafts Query
From source (services/scheduler.ts:121-128):
```
DraftModel.find({ status: 'ready', $or: [{ scheduledAt: null }, { scheduledAt: { $lte: now } }] })
```

**Database state:** 1 draft exists with `status: 'draft'`.  
**SCHEDULER WILL NOT PICK UP** — Status is `draft`, not `ready`.

### 5.3 Publishing Attempt Evidence
- `PublishHistory` collection: **0 records**
- All draft `lastAttemptAt` fields: **None set**
- All post `lastAttemptAt` fields: **Nonexistent**

**PROOF: The scheduler has never executed a publish operation on any post or draft.**

---

## 6. Platform Status Matrix

| Platform | OAuth Implemented? | Access Token Stored? | Refresh Token Stored? | Can Publish Real Content? | Production Ready? |
|---|---|---|---|---|---|
| **Twitter/X** | YES — PKCE OAuth 2.0 | **NO** (stored as mock plaintext) | **NO** (stored as mock plaintext) | **POTENTIALLY** (real provider + API endpoint exist) | **NO** — account was connected via mock flow, token not encrypted, decrypt will crash |
| **LinkedIn** | **NO** — placeholders trigger MockSocialProvider | **NO** — only through mock flow | **NO** | **NO** — MockSocialProvider returns fake IDs | **NO** — missing real credentials |
| **YouTube** | YES — Google OAuth 2.0 | **NO** — never connected via OAuth | **NO** | **NO** — `publishPost()` throws "video upload not implemented" | **NO** — publishing not implemented |
| **Instagram** | **NO** — no provider class exists | Only through mock flow | Only through mock flow | **NO** | **NO** |
| **Facebook** | **NO** — no provider class exists | Only through mock flow | Only through mock flow | **NO** | **NO** |
| **TikTok** | **NO** — no provider class exists | Only through mock flow | Only through mock flow | **NO** | **NO** |

---

## 7. Failure Analysis

### Failure 1: Login endpoint crashes (500 error)

| Field | Value |
|---|---|
| **Evidence** | `POST /api/auth/login` → HTTP 500 with generic error |
| **Impact** | Users cannot log in via email/password. 2 of 5 users in DB use `local` auth provider. |
| **Root cause** | Not determined from runtime (no server logs visible). Likely an unhandled exception in the auth login flow. |

### Failure 2: Twitter account token is mock/unencrypted

| Field | Value |
|---|---|
| **Evidence** | DB: `accessToken` = 22 chars, no colon separator → `EncryptionAdapter.decrypt()` throws |
| **Impact** | `DraftPublisher.publishDraft()` will crash at line 96 with "Invalid encrypted format" |
| **Root cause** | Account was connected via `POST /api/social/connect-direct` (legacy mock) instead of OAuth callback. |
| **Files involved** | `features/draft/draft.publisher.ts:96` → `services/social/adapters/encryption.adapter.ts:24` |

### Failure 3: No posts in database

| Field | Value |
|---|---|
| **Evidence** | `posts` collection: 0 documents |
| **Impact** | Scheduler has nothing to process. Publishing workflow never triggered. |
| **Root cause** | The Post Scheduler frontend page may have been crashing (previous `.map()` bug) or users never created posts. |

### Failure 4: Draft never queued

| Field | Value |
|---|---|
| **Evidence** | 1 draft with `status: 'draft'` — scheduler queries `status: 'ready'` |
| **Impact** | Draft will never be published |
| **Root cause** | Draft was created but never queued (`POST /drafts/:id/queue` not called) |

### Failure 5: FRONTEND_URL points to localhost

| Field | Value |
|---|---|
| **Evidence** | OAuth callback redirects to `http://localhost:5173/settings?connection=...` |
| **Impact** | After OAuth, user is redirected to localhost instead of production frontend (Vercel) |
| **Root cause** | `FRONTEND_URL` in env is `http://localhost:5173` — should be the production URL |
| **Fix** | Update `FRONTEND_URL` to Vercel deployment URL |

### Failure 6: Zenuxs OAuth redirect_uri points to localhost

| Field | Value |
|---|---|
| **Evidence** | Redirect URL contains `redirect_uri=http://localhost:5000/...` |
| **Impact** | OAuth provider (Zenuxs) will redirect to localhost after auth, not to Render |
| **Root cause** | `BACKEND_URL` env var not set → falls back to `http://localhost:${env.PORT}` in `getBackendUrl()` |

### Failure 7: LinkedIn uses MockSocialProvider

| Field | Value |
|---|---|
| **Evidence** | `LINKEDIN_CLIENT_ID` starts with `your_` → `isMockCredentials()` = true |
| **Impact** | All LinkedIn operations use fake data. No real publishing. |
| **Fix** | Replace placeholder credentials with real LinkedIn app credentials |

---

## 8. Final Workflow Status

```
Frontend (Scheduler.tsx)
  → API (POST /api/posts)
  → Validation (Zod)
  → Database (Post collection)     → 0 posts exist. NEVER EXECUTED.
  → Scheduler (15s poll)
  → processScheduledPosts()        → Query matches 0 posts. NEVER EXECUTED.
  → Atomic claim (findOneAndUpdate)
  → DraftPublisher.publishDraft()
  → EncryptionAdapter.decrypt()    → Would CRASH on mock token. NEVER EXECUTED.
  → ProviderFactory.getProvider()  → Would select TwitterProvider. NEVER EXECUTED.
  → provider.publishPost()         → Would POST /2/tweets. NEVER EXECUTED.
  → Platform API Response          → NEVER RECEIVED.
  → Status: published/failed       → NEVER SET.
```

**The complete publishing workflow has never been executed from end to end.**

---

## 9. Verification Checklist

| # | Requirement | Result | Evidence |
|---|---|---|---|
| 1 | OAuth callback is executed | **NOT VERIFIED** | No real OAuth callback has been tested end-to-end |
| 2 | accessToken is actually stored | **FAIL** | Stored as unencrypted mock 22-char token |
| 3 | Token is encrypted | **FAIL** | Token is plaintext `mock_token_xxx` format |
| 4 | Token can be decrypted | **FAIL** | `EncryptionAdapter.decrypt()` throws on mock token |
| 5 | Account appears in SocialAccount collection | **PASS** | 1 account exists: twitter/developer_azaz |
| 6 | Provider receives the decrypted token | **NOT VERIFIED** | Publishing never executed |
| 7 | POST /2/tweets is actually called | **FAIL** | Zero publish history records exist |
| 8 | Platform API response received | **FAIL** | No publishing has been attempted |
| 9 | Scheduled posts transition: scheduled → publishing → published | **FAIL** | Zero posts in any status exist |

**Overall Status: NOT PRODUCTION READY**

---

## 10. Files Modified (from audit)

| File | Change | Status |
|---|---|---|
| `client/src/pages/Settings.tsx` | Replaced mock modal with real OAuth redirect flow | **NEEDS DEPLOY** |
| `client/src/services/api.ts` | Added `connectOAuth(platform)` method | **NEEDS DEPLOY** |
| `server/src/features/post/post.service.ts` | Auto-promote `status` to `scheduled` when `scheduledAt` provided | **NEEDS DEPLOY** |
| `server/src/features/post/post.controller.ts` | Added `bulkSchedule` handler | **NEEDS DEPLOY** |
| `server/src/features/post/post.routes.ts` | Added `POST /api/posts/schedule` route | **NEEDS DEPLOY** |
| `server/src/services/social/providers/linkedin.provider.ts` | Added `w_member_social` scope | **NEEDS DEPLOY** |

**All code changes are compiled but NOT deployed to Render.**

---

## 11. Deployed vs. Repository State

| Component | Repository (local) | Deployed (Render) | Match? |
|---|---|---|---|
| `post.service.ts` | Has `effectiveStatus` auto-promote | Unknown | ❓ |
| `Settings.tsx` | Has OAuth redirect flow | Unknown (would need client rebuild) | ❓ |
| `linkedin.provider.ts` | Has `w_member_social` scope | Unknown | ❓ |
| `Scheduler.tsx` | Has status/timezone fixes | Unknown | ❓ |

**The deployed code MAY differ from the repository.** The changes from this session have not been deployed to Render.
