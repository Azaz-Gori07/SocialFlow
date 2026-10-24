# E2E Auto-Post Runbook

Checklist for exercising the developer activity → draft → publish pipeline
against a real provider account. Every step must pass before moving on;
never publish without the compliance gate and a human reviewing the caption.

## Phases

1. **Pre-flight** — `/health`, developer status, connect-URL generation for
   each social platform (must return a real provider OAuth URL, never a mock).
2. **Auth** — log in, verify `/api/auth/me` and at least one workspace.
3. **Connect social account** — OAuth the real provider account, verify
   `connectionStatus: connected`, `capabilities.createPost: true`, token
   stored in `gcm:` format, and enable `autoPostEnabled`.
4. **Connect GitHub + sync** — OAuth GitHub, mirror repositories, incremental
   sync of the test repo. Initial syncs store opportunities as `baseline`
   (history is not news); only incremental syncs produce `pending`
   opportunities eligible for generation.
5. **Generate draft** — `POST /api/developer/content/auto-run`; verify the
   draft targets exactly one account, compliance status, and caption length
   (LinkedIn limit 2800). A human must read and approve the caption.
6. **Publish** — record start time, publish, poll for `externalPostId`,
   verify with the provider API, and confirm DB history rows.
7. **Safety systems while live** — daily cap blocks a second generation,
   compliance row records the published post, metrics and digest reflect it.
8. **Delete within 3 minutes** — provider-side delete, verify 404, mark the
   history row `deleted`. If the window lapses, hand the deletion URL to the
   operator immediately.
9. **Self-improvement** — error tracker captures any failure; inject a test
   error and resolve it.
10. **Cleanup** — remove test drafts, optionally disconnect accounts, rotate
    any credentials used during the run.
