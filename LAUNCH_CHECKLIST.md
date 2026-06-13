# Launch Checklist — SocialFlow

## Pre-Launch Blockers

| Item | Status | Notes |
|------|--------|-------|
| **Publishing flows** (Draft Library) | ❌ BLOCKED | Draft router not mounted in `server.ts` — all 4 draft flows return 404 |

---

## Phase B Findings

### Build Status

| Project | Build | Audit |
|---------|-------|-------|
| Backend (`server/`) | ✅ Passes (`tsc`) | ⚠️ 1 high-severity (`nodemailer` — fix with `npm audit fix --force`) |
| Frontend (`client/`) | ✅ Passes (`tsc -b && vite build`) | ✅ 0 vulnerabilities |

---

## Launch Checklist

### 1. Domain Connected
- [ ] Purchase production domain (e.g., `socialflow.app`)
- [ ] Configure DNS A/AAAA/CNAME records pointing to hosting provider
- [ ] Verify domain ownership with hosting provider

### 2. SSL Active
- [ ] Enable auto-TLS/SSL on hosting provider (Vercel/Netlify/Railway)
- [ ] Verify HTTPS works: `https://<domain>`
- [ ] Test OAuth callbacks over HTTPS

### 3. MongoDB Backup Enabled
- [ ] Enable automated daily backups in MongoDB Atlas
- [ ] Configure backup retention policy (minimum 7 days)
- [ ] Test point-in-time recovery
- [ ] Verify backup alerts are configured

### 4. OAuth Redirect URLs Configured
- [ ] **Zenuxs OAuth**: Update dashboard with production redirect URIs
- [ ] **Google OAuth**: Update Google Cloud Console OAuth redirect URIs
- [ ] **Twitter/X OAuth**: Update developer portal callback URLs
- [ ] **Facebook/Instagram OAuth**: Update Meta Developer redirect URIs
- [ ] **LinkedIn OAuth**: Update LinkedIn Developer redirect URIs
- [ ] **GitHub OAuth** (via Zenuxs): Update GitHub OAuth App callback URL

### 5. Email Provider Configured
- [ ] Replace Gmail app password with production SMTP provider (SendGrid / AWS SES / Postmark)
- [ ] Configure `EMAIL_USER` / `EMAIL_PASS` with production credentials
- [ ] Test OTP delivery flow end-to-end
- [ ] Verify email from address and reply-to

### 6. Error Logging Configured
- [ ] Set up error monitoring (Sentry / LogRocket / Datadog)
- [ ] Verify `errorMiddleware` in `server.ts:158` captures and reports all errors
- [ ] Configure log retention and alerting
- [ ] Ensure no secrets/keys in error logs (verified: tokens use `#` hash fragment, not query params)

### 7. Production Build Deployed
- [ ] **Environment variables** — Update `server/.env` for production:
  - `FRONTEND_URL=https://<production-domain>`
  - `MONGO_URI` — production Atlas cluster (use a separate cluster from dev)
  - `JWT_SECRET` / `JWT_REFRESH_SECRET` — use strong, unique secrets
  - `ENCRYPTION_KEY` — set a unique key for token encryption
  - All social OAuth client IDs/Secrets — use production credentials
  - `REDIS_HOST/PORT/PASSWORD` — configure production Redis instance
- [ ] **Client env** — Update `client/.env` for production:
  - `VITE_BACKEND_API_URL=https://<production-domain>/api`
- [ ] **CORS configuration** — Update `CORS_ORIGIN` env var with production domain
- [ ] **.env.example completeness** — Missing fields to add:
  - `OTP_EXPIRY_MINUTES`, `OTP_EMAIL_HOST`, `OTP_EMAIL_PORT`, `OTP_EMAIL_USER`, `OTP_EMAIL_PASS`
  - `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
  - `ENCRYPTION_KEY`
  - `ZENUXS_GOOGLE_CLIENT_ID`, `ZENUXS_GOOGLE_CLIENT_SECRET`
  - `ZENUXS_GITHUB_CLIENT_ID`, `ZENUXS_GITHUB_CLIENT_SECRET`
- [ ] **nodemailer vulnerability** — Run `npm audit fix --force` in `server/` to patch high-severity vuln

---

## Post-Deployment Verification

- [ ] Smoke test all 14 flows against production URL
- [ ] Verify real-time notifications via Socket.IO
- [ ] Test OAuth login end-to-end on production domain
- [ ] Verify BullMQ/Redis queue processes scheduled posts
- [ ] Confirm MongoDB connection and query performance
- [ ] Check error monitoring dashboard for unhandled exceptions
- [ ] Verify analytics aggregation works with real data

---

## Rollback Plan

- Keep the current dev deployment (`localhost:5173`) running until production is verified
- Maintain the current MongoDB Atlas cluster as a fallback
- Keep all pre-production `.env` values documented for quick restore
