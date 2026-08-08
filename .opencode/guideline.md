# SocialFlow — Complete Production Audit, Architecture, Social API Integration & UI/UX Transformation

You are working on **SocialFlow**, an AI-powered social media management SaaS.

The goal is NOT to simply make the existing application look better.

The goal is to transform the existing codebase into a **production-grade, scalable, secure, real-data social media management platform** with reliable social-account connections, real social APIs, correct publishing/read/sync workflows, optimized frontend/backend architecture, and a premium animated 3D interface supporting both dark and light themes.

Before changing anything, deeply inspect the existing repository and understand its current architecture.

Do not blindly rewrite the application.

---

# 1. NON-NEGOTIABLE PRINCIPLES

1. Inspect first, implement second.
2. Preserve working functionality.
3. Fix wrong logic instead of hiding it with UI changes.
4. Never use fake social-media data where real API data is available.
5. Never generate random follower counts, verification states, engagement numbers, post IDs, account IDs, platform statuses, or fake analytics.
6. Never show a successful UI state unless the backend/provider operation actually succeeded.
7. Never assume one connected OAuth session equals one social account.
8. Never automatically choose `accounts[0]`.
9. Every social account must have a unique internal ID and provider-specific external account ID.
10. Never store raw social access tokens in frontend/localStorage.
11. Never expose provider secrets to the client.
12. Do not invent social-platform capabilities that the provider does not actually expose.
13. Respect every platform's current API restrictions, permissions, rate limits and review requirements.
14. Payment functionality is outside the scope of this task unless already required by the existing product.
15. Do not implement fake API fallbacks just to make a screen appear functional.

---

# 2. FIRST: COMPLETE CODEBASE AUDIT

Before editing code, inspect:

## Frontend

* React structure
* routes
* pages
* components
* contexts
* hooks
* API services
* state management
* CSS
* design tokens
* animations
* responsive behavior
* error handling
* loading states
* empty states
* authentication guards
* social account flows

## Backend

Inspect:

* Express/server architecture
* controllers
* routes
* services
* repositories
* models
* database layer
* middleware
* authentication
* OAuth
* provider adapters
* scheduler
* background jobs
* WebSockets
* analytics
* notifications
* error handling
* validation
* logging
* tests

## Also inspect

* package.json
* lockfiles
* environment files
* `.env.example`
* `.gitignore`
* committed generated files
* node_modules
* unused dependencies
* duplicate utilities
* dead code
* TODO/FIXME
* temporary/demo/mock code
* `console.log`
* `any`
* unsafe type assertions
* duplicated API logic
* duplicated UI components

---

# 3. CREATE A REAL AUDIT MATRIX

Before implementation create an internal audit table:

| Area        | Current State | Problem | Severity | Required Fix |
| ----------- | ------------- | ------- | -------- | ------------ |
| Auth        | ...           | ...     | P0/P1/P2 | ...          |
| Facebook    | ...           | ...     | ...      | ...          |
| Instagram   | ...           | ...     | ...      | ...          |
| X           | ...           | ...     | ...      | ...          |
| LinkedIn    | ...           | ...     | ...      | ...          |
| Scheduling  | ...           | ...     | ...      | ...          |
| Analytics   | ...           | ...     | ...      | ...          |
| Workspace   | ...           | ...     | ...      | ...          |
| UI          | ...           | ...     | ...      | ...          |
| Performance | ...           | ...     | ...      | ...          |

Do not claim something is working until the actual code path has been traced.

---

# 4. SOCIAL ACCOUNT ARCHITECTURE MUST BE FIXED

The existing application must support:

```text
SocialFlow User
       │
       ├── Facebook Page A
       ├── Facebook Page B
       ├── Instagram Business A
       ├── Instagram Business B
       ├── X Account A
       ├── LinkedIn Personal
       └── LinkedIn Organization A
```

Never model the system as:

```text
User → one Facebook account
User → one Instagram account
```

Instead use:

```text
User
  ↓
OAuth Connection
  ↓
Provider Account(s)
  ↓
Provider-specific external account
```

---

# 5. SOCIAL ACCOUNT DATA MODEL

Design/upgrade the social account model to contain concepts such as:

```text
id
userId / workspaceId
provider
providerAccountId
providerParentAccountId
accountType
username
displayName
avatarUrl
accessTokenEncrypted
refreshTokenEncrypted
tokenType
expiresAt
scopes
permissions
capabilities
status
connectionStatus
lastValidatedAt
lastSyncedAt
lastError
metadata
createdAt
updatedAt
```

Do not blindly add every field if the current architecture has a better equivalent.

The important requirement is:

### Every connected account must know:

* which provider it belongs to
* which external account it represents
* which token belongs to it
* which permissions were granted
* which capabilities are available
* whether the connection is healthy
* when it was last synchronized
* why it failed if unhealthy

---

# 6. OAUTH FLOW MUST BE PROVIDER-AWARE

Do not create one generic OAuth implementation and assume all providers behave identically.

Each provider must implement its own OAuth lifecycle through a common interface.

Recommended abstraction:

```text
SocialProvider
 ├── getAuthorizationUrl()
 ├── exchangeCode()
 ├── refreshAccessToken()
 ├── getAuthenticatedIdentity()
 ├── discoverAccounts()
 ├── getAccount()
 ├── getCapabilities()
 ├── validateConnection()
 ├── uploadMedia()
 ├── createPost()
 ├── getPost()
 ├── listPosts()
 ├── deletePost()
 ├── getInsights()
 ├── listComments()
 ├── replyToComment()
 └── disconnect()
```

Provider-specific differences belong inside provider adapters.

Do not scatter Facebook/X/LinkedIn-specific API calls throughout controllers and React components.

---

# 7. FACEBOOK CONNECTION — CORRECT FLOW

Implement Facebook Page connections correctly.

The user is NOT giving SocialFlow unlimited access to their entire Facebook account.

The correct conceptual flow is:

```text
User
 ↓
Facebook OAuth
 ↓
Facebook User Access Token
 ↓
Discover Pages managed by user
 ↓
Return available Pages
 ↓
User selects Page
 ↓
Obtain Page Access Token
 ↓
Validate Page permissions/tasks
 ↓
Create SocialFlow Facebook Page account
```

Meta's current API examples show that `/me/accounts` can return managed Pages, Page access tokens and Page tasks.

Store the selected Page as its own connected account.

Example:

```text
provider = facebook
accountType = page
providerAccountId = page_id
accessToken = encrypted page access token
parentConnectionId = facebook oauth connection
capabilities = [...]
```

Never use the Facebook User Access Token when a Page Access Token is required for Page operations.

---

# 8. FACEBOOK CAPABILITY SYSTEM

After connection, calculate actual capabilities.

For example:

```text
canReadProfile
canReadPosts
canPublishPosts
canPublishPhotos
canPublishVideos
canReadComments
canManageComments
canReadInsights
canManageMessages
canUseWebhooks
```

These must be based on actual provider permissions/tasks and API responses.

Do not simply set:

```text
connected = true
fullAccess = true
```

That is bad logic.

Instead show:

```text
Connected
Publishing ✓
Analytics ✓
Comments ✓
Messaging ✕
Reason: permission not granted
```

---

# 9. FACEBOOK POSTING

Implement real provider operations.

Example architecture:

```text
SocialFlow Post
      ↓
FacebookProvider.createPost()
      ↓
Validate capability
      ↓
Validate content
      ↓
Upload media if needed
      ↓
Call Meta Graph API
      ↓
Receive provider post ID
      ↓
Store providerPostId
      ↓
Return normalized result
```

Every provider operation must return normalized data:

```text
provider
providerAccountId
providerPostId
status
publishedAt
url
rawProviderStatus
```

Never fabricate a post ID.

---

# 10. FACEBOOK READ OPERATIONS

Implement actual read synchronization where supported:

* Page profile
* Page metadata
* Page posts
* post details
* comments
* engagement
* insights
* publishing history
* provider errors
* account status

Use pagination.

Never fetch only the first page of results and call it "all posts".

Implement:

```text
cursor
nextCursor
hasMore
```

and normalize provider pagination.

---

# 11. FACEBOOK WEBHOOKS

Where supported and useful, implement webhook infrastructure.

Use webhooks for events such as:

* comments
* messages
* account/page changes
* publishing-related updates
* other supported provider events

Do not repeatedly poll APIs for events that the provider can deliver through webhooks.

Webhook processing must be:

```text
receive
 ↓
verify signature
 ↓
parse event
 ↓
deduplicate event
 ↓
persist event
 ↓
update internal state
 ↓
notify frontend
```

Webhook handlers must be idempotent.

---

# 12. INSTAGRAM INTEGRATION

Support Instagram correctly.

Do not treat Instagram as simply another Facebook account.

Support Professional accounts according to the current Instagram API capabilities.

The Meta API supports Instagram Professional accounts and, depending on the login method and granted permissions, content publishing, media retrieval, comments, mentions and insights. Consumer Instagram accounts are not supported by the Facebook Login version of the API.

Support both provider models where appropriate:

```text
Instagram via Meta/Facebook Login
```

and, where suitable:

```text
Instagram Login
```

The current Instagram Login scopes include names such as:

```text
instagram_business_basic
instagram_business_content_publish
instagram_business_manage_comments
instagram_business_manage_messages
```

Use the current provider documentation instead of deprecated scope names.

---

# 13. INSTAGRAM PUBLISHING

Implement the actual Instagram publishing lifecycle.

Do NOT directly pretend that:

```text
POST /instagram
```

is enough.

For supported content types use the provider's real flow:

```text
Upload/Create Media Container
        ↓
Wait/check processing state where required
        ↓
Publish container
        ↓
Receive Instagram Media ID
        ↓
Persist providerPostId
```

For Reels, the Meta API flow includes creating a container, checking container status, then publishing it.

Support provider-specific validation:

* media type
* aspect ratio
* file size
* video duration
* codec
* image format
* caption limits
* publishing restrictions

Do not allow the UI to promise a format that the provider will reject.

---

# 14. X INTEGRATION

Use current X API architecture.

Use OAuth 2.0 Authorization Code with PKCE where appropriate.

Request only scopes required by the actual features.

For posting, current X documentation maps post creation to user authorization with:

```text
tweet.read
tweet.write
users.read
```

and `media.write` when uploading media. `offline.access` is used when persistent connection is required.

Implement:

```text
GET authenticated user
GET user posts
POST post
DELETE own post
POST reply
POST quote
POST media
GET post details
GET engagement where available
```

X's current API uses `POST /2/tweets` for creating posts and requires media upload first when media is attached.

Handle:

* rate limits
* 401
* 403
* 429
* token expiration
* media errors
* provider-specific restrictions

Do not retry 4xx errors blindly.

---

# 15. LINKEDIN INTEGRATION

Support both:

```text
Member / personal account
```

and:

```text
Organization / company page
```

where the user's permissions and app approval allow it.

Current LinkedIn Posts API supports text, images, videos, documents and other post types, but permissions differ between member and organization posting. Organization posting requires appropriate organization roles and permissions such as `w_organization_social`.

Use the current Posts API rather than deprecated UGC Posts APIs.

For media:

```text
Upload media
 ↓
Receive asset URN
 ↓
Create post referencing asset
```

LinkedIn explicitly requires media assets to be uploaded before creating image/video posts.

Every LinkedIn organization must be represented separately.

Never choose the first organization automatically.

---

# 16. SOCIAL PROVIDER CAPABILITY MATRIX

Create a normalized capability layer:

```text
ProviderCapabilities
{
  readProfile
  readPosts
  createPost
  deletePost
  updatePost
  uploadImage
  uploadVideo
  carousel
  stories
  reels
  commentsRead
  commentsWrite
  insights
  messaging
  webhooks
}
```

The UI should dynamically adapt to actual capabilities.

Example:

```text
Instagram
✓ Posts
✓ Reels
✓ Comments
✓ Insights
✕ Messaging
```

Do not render unsupported actions.

---

# 17. NEVER USE `accounts[0]`

This is mandatory.

Every post must explicitly identify the destination account.

Instead of:

```text
platform = facebook
```

use:

```text
destinationAccounts = [
  {
    socialAccountId: "..."
  }
]
```

A scheduled post must know exactly where it is going.

Example:

```text
Post
 ├── Facebook Page A
 ├── Instagram Brand A
 ├── X Brand Account
 └── LinkedIn Company Page
```

The scheduler must never guess.

---

# 18. PER-PLATFORM POST STATE

Do NOT maintain only:

```text
post.status = published
```

Use:

```text
Post
 ├── status
 └── deliveries[]
```

Example:

```text
deliveries:
[
  {
    socialAccountId,
    provider,
    status: published,
    providerPostId,
    publishedAt
  },
  {
    socialAccountId,
    provider,
    status: failed,
    errorCode,
    errorMessage
  }
]
```

This allows:

```text
Facebook ✓ Published
Instagram ✓ Published
X ✕ Failed
LinkedIn ⏳ Pending
```

The main post status should be derived from delivery states.

---

# 19. IDEMPOTENT PUBLISHING

Prevent duplicate posts.

A scheduled job must have an idempotency key.

Example:

```text
postId + socialAccountId + scheduledAttempt
```

Before publishing:

```text
Has this delivery already succeeded?
        ↓
YES → do not publish again
NO → publish
```

This is extremely important because scheduler retries can otherwise create duplicate social posts.

---

# 20. SCHEDULER ARCHITECTURE

Current simple polling is not enough for production scale.

Keep the existing architecture if appropriate, but improve it.

Requirements:

* atomic job claiming
* per-delivery locking
* retry policy
* exponential backoff
* max retries
* idempotency
* stale job recovery
* rate-limit handling
* provider-specific retry rules
* dead-letter/failed state
* observability
* concurrency control

Do not retry:

```text
400 invalid request
401 invalid/revoked token
403 missing permission
```

without first fixing the underlying condition.

Retry temporary failures such as:

```text
429
5xx
network timeout
provider temporary unavailable
```

with bounded exponential backoff.

---

# 21. TOKEN MANAGEMENT

Tokens are sensitive credentials.

Requirements:

* encrypt at rest
* never expose raw token to frontend
* never log raw tokens
* never put tokens in URLs
* never commit `.env` secrets
* never expose provider client secrets
* refresh before expiration where supported
* record token expiration
* record scopes
* mark connection unhealthy when refresh fails
* ask user to reconnect when necessary

The frontend should only receive safe account information:

```text
id
provider
username
avatar
status
capabilities
expiresSoon
```

Never:

```text
accessToken
refreshToken
clientSecret
```

---

# 22. OAUTH SECURITY

OAuth state must be:

* unpredictable
* bound to the initiating user/session
* time-limited
* one-time-use
* provider-specific
* protected against replay

Do not rely only on an encrypted payload with a timestamp.

Store/consume OAuth transaction state server-side where appropriate.

Also validate:

* redirect URI
* provider
* state
* code
* PKCE verifier
* session/user association

---

# 23. WORKSPACE ARCHITECTURE

If SocialFlow supports workspaces, all major resources must be workspace-aware.

Audit:

* posts
* drafts
* social accounts
* analytics
* comments
* notifications
* media
* schedules
* team members

Do not allow:

```text
User A → accidentally query User B's workspace resources
```

Every resource must be authorized against:

```text
currentUser
+
workspace
+
role
+
resource ownership
```

---

# 24. ROLE/PERMISSION SYSTEM

Implement real authorization.

Example:

```text
Owner
Admin
Editor
Viewer
```

Permissions could include:

```text
viewAnalytics
createPost
editPost
deletePost
schedulePost
publishPost
connectAccount
disconnectAccount
manageMembers
manageWorkspace
manageComments
```

Do not rely on frontend hiding buttons.

Backend authorization must enforce permissions.

---

# 25. ANALYTICS MUST USE REAL PROVIDER DATA

Remove all:

```text
Math.random()
fake metrics
sample analytics
hardcoded follower count
fake engagement
fake verified state
fake growth
```

Analytics pipeline:

```text
Provider API
 ↓
Provider normalizer
 ↓
Analytics ingestion
 ↓
Database
 ↓
Aggregation
 ↓
Dashboard API
 ↓
Frontend charts
```

Store:

```text
provider
socialAccountId
metric
value
period
timestamp
source
```

Clearly distinguish:

```text
live provider data
cached provider data
calculated internal metric
```

Never call cached data "real-time".

---

# 26. ANALYTICS PERIODS

Do not label a number:

```text
vs previous day
```

unless backend actually calculates previous-day comparison.

Every analytics response should include:

```text
periodStart
periodEnd
comparisonStart
comparisonEnd
lastUpdatedAt
source
```

Then frontend can accurately display:

```text
+12.4%
vs previous 7 days
```

---

# 27. EXPORTS

Audit CSV/PDF export.

Do not create a text blob and merely label it:

```text
application/pdf
```

as a PDF.

Implement genuine:

* CSV export
* valid PDF generation

with:

* correct headers
* date range
* account
* provider
* metric definitions
* generated timestamp

---

# 28. CONTENT STUDIO

Content Studio should become a real publishing workspace.

Include:

```text
AI generation
Platform selection
Account selection
Per-platform content
Media
Preview
Validation
Schedule
Publish now
Save draft
```

Never show:

```text
Publish immediately
```

if the backend actually only creates a draft.

---

# 29. PLATFORM-SPECIFIC CONTENT

Do not treat one caption as universally valid.

Each platform should have its own content object:

```text
platformContent:
{
  facebook: {...},
  instagram: {...},
  twitter: {...},
  linkedin: {...}
}
```

Allow:

* different captions
* different hashtags
* different media
* different crop
* platform-specific validation
* platform-specific preview

---

# 30. MEDIA PIPELINE

Create a centralized media system.

Requirements:

```text
upload
 ↓
validate
 ↓
store
 ↓
process
 ↓
generate metadata
 ↓
provider-specific preparation
 ↓
provider upload
 ↓
provider asset ID
```

Store:

```text
mimeType
size
width
height
duration
checksum
storageUrl
thumbnailUrl
createdAt
```

Avoid uploading the same media repeatedly if the provider supports reuse.

---

# 31. CONTENT CALENDAR

Build a proper scheduling experience.

Support:

* calendar
* list
* filters
* account filter
* platform filter
* status
* date range
* drag/drop rescheduling
* timezone
* retry failed post
* duplicate post
* edit scheduled post
* cancel scheduled post

---

# 32. ACCOUNT CONNECTION UX

Create a premium account connection flow.

Example:

```text
Connect Social Account
        ↓
Choose platform
        ↓
OAuth
        ↓
Discover available accounts
        ↓
Select account(s)
        ↓
Review permissions/capabilities
        ↓
Connect
        ↓
Validate
        ↓
Sync initial data
        ↓
Connected
```

After connection show:

```text
Facebook
Acme Official Page

Connected ✓

Publishing ✓
Analytics ✓
Comments ✓

Last synced:
2 minutes ago
```

If something is unavailable:

```text
Messaging unavailable
Required permission was not granted
[Reconnect]
```

---

# 33. CONNECTION HEALTH

Every account needs a health status:

```text
healthy
warning
expired
revoked
permission_missing
rate_limited
error
disconnected
```

Add:

```text
Reconnect
Refresh connection
View permissions
Disconnect
```

Do not simply show a green "Connected" badge forever.

---

# 34. FRONTEND ARCHITECTURE

Refactor frontend where necessary.

Avoid:

```text
huge page component
inline styles everywhere
duplicated API calls
any
untyped responses
duplicate modals
duplicate buttons
duplicate cards
```

Create:

```text
components/ui
components/layout
components/social
components/content
components/analytics
components/accounts
components/scheduler
hooks
services
types
utils
```

Use shared types.

Prefer:

```text
API response type
→ domain type
→ UI model
```

rather than passing raw provider responses throughout the application.

---

# 35. API CLIENT

Centralize:

* authentication
* retries
* error normalization
* timeout
* request IDs
* refresh token handling
* cancellation
* pagination
* response validation

Use typed API responses.

Avoid every page independently implementing fetch logic.

---

# 36. BACKEND ARCHITECTURE

Use clear separation:

```text
Route
 ↓
Controller
 ↓
Application Service
 ↓
Domain/Provider Service
 ↓
Repository
 ↓
Database
```

Provider calls should never be buried inside controllers.

Controllers should not contain business logic.

---

# 37. VALIDATION

Validate all external input.

Use schema validation for:

* auth
* posts
* schedules
* social accounts
* media
* analytics filters
* workspace operations
* comments
* AI requests

Never trust frontend validation.

---

# 38. ERROR SYSTEM

Create normalized errors:

```text
AUTH_REQUIRED
INVALID_TOKEN
TOKEN_EXPIRED
PERMISSION_DENIED
PROVIDER_RATE_LIMIT
PROVIDER_UNAVAILABLE
INVALID_MEDIA
INVALID_CONTENT
ACCOUNT_DISCONNECTED
ACCOUNT_NOT_FOUND
POST_FAILED
DUPLICATE_POST
```

Frontend should map errors into human-readable messages.

Do not expose raw provider stack traces to users.

---

# 39. PERFORMANCE

Audit:

* bundle size
* unnecessary renders
* expensive charts
* animations
* WebGL
* image sizes
* lazy loading
* route splitting
* API request duplication
* polling
* database indexes
* N+1 queries

Do not poll every API every few seconds.

Use:

```text
webhooks
cache
stale-while-revalidate
manual refresh
smart polling
```

where appropriate.

---

# 40. DATABASE OPTIMIZATION

Audit indexes for:

```text
userId
workspaceId
provider
providerAccountId
socialAccountId
status
scheduledAt
createdAt
publishedAt
```

Avoid unbounded queries.

Always paginate large collections.

Never fetch thousands of posts just to show the first 20.

---

# 41. CODE QUALITY

Enforce:

* TypeScript strictness
* no unnecessary `any`
* no dead code
* no duplicated logic
* no unused imports
* no magic constants
* no secrets
* consistent naming
* consistent error handling
* reusable abstractions
* comments only where useful
* small focused functions

Run:

```text
typecheck
lint
test
build
```

and fix errors rather than ignoring them.

---

# 42. TESTING

Create/expand tests for:

## Authentication

* login
* refresh
* logout
* expired token

## OAuth

* state validation
* replay prevention
* wrong provider
* expired state
* invalid code
* callback failure

## Social accounts

* connect
* multiple accounts
* disconnect
* token expiry
* permission changes

## Publishing

* Facebook
* Instagram
* X
* LinkedIn
* media
* failures
* retries
* duplicate prevention

## Scheduler

* due job
* concurrent workers
* stale lock
* retry
* 429
* 5xx
* permanent failure

## Authorization

Test that one workspace cannot access another workspace's data.

---

# 43. OBSERVABILITY

Add structured logs with:

```text
requestId
userId
workspaceId
socialAccountId
provider
operation
duration
status
errorCode
```

Never log:

```text
accessToken
refreshToken
clientSecret
authorizationCode
```

Add metrics for:

```text
publish_success
publish_failure
provider_latency
rate_limit
token_refresh
oauth_failure
webhook_events
scheduler_lag
```

---

# 44. UI/UX — COMPLETE REDESIGN

The current UI should not receive random decorative changes.

First create a coherent design system.

The product should feel like:

```text
Premium
AI-native
Technical
Elegant
Fast
Trustworthy
Creative
Professional
```

Avoid generic:

```text
purple gradient SaaS
random glass cards
too many cards
excessive glow
excessive shadows
random rounded rectangles
```

---

# 45. DARK + LIGHT THEMES

Both themes must be first-class.

Do not build dark mode first and simply invert colors.

Define semantic tokens:

```text
background
surface
surfaceElevated
surfaceInteractive
foreground
foregroundMuted
border
accent
accentStrong
success
warning
danger
info
shadow
glow
```

Every component must work in:

```text
Light
Dark
```

without unreadable text or broken contrast.

Theme switching should be animated but subtle.

---

# 46. 3D UI DIRECTION

The UI should have a strong 3D/animated identity, but 3D must be purposeful.

Use 3D for:

* dashboard hero
* account connection visualization
* analytics visualizations
* social orbit
* content preview
* media previews
* empty states
* onboarding
* command center
* interactive backgrounds
* premium hover states

Do NOT turn every input, table and button into a WebGL object.

The application must remain fast and usable.

---

# 47. 3D DESIGN LANGUAGE

Use:

```text
depth
perspective
soft lighting
layered surfaces
floating panels
subtle parallax
spring motion
particle fields
orbital elements
3D cards
depth-based hover
animated gradients
shader backgrounds
```

But preserve:

```text
readability
accessibility
performance
keyboard navigation
reduced motion
mobile usability
```

---

# 48. COMPONENT SOURCES

Use free/open-source components from sources such as:

* 21st.dev
* Lightswind UI
* Origin UI
* other verified free component libraries

21st currently provides a large React/Tailwind component registry and explicitly supports copy-to-repository workflows.

Lightswind provides free/open-source components, including animated and 3D components, and supports dark mode. Its free ecosystem includes components such as 3D carousels, particle backgrounds, theme toggles and animated UI.

### IMPORTANT LICENSE RULE

Before copying any external component:

1. Verify its license.
2. Use only components that are explicitly free/open-source and compatible with this project's intended use.
3. Prefer MIT/Apache/BSD or another clearly permissive license.
4. Do not copy paid/proprietary components.
5. Do not copy premium templates merely because they are visually accessible.
6. Preserve required attribution/license notices when required.
7. If license is unclear, do not use the component.

Refero should primarily be used for design-system/reference research, not blindly copied as proprietary code. Refero provides AI-readable design systems containing typography, spacing, colors and component patterns.

Design Vault should be used as UX-pattern/reference research for flows such as dashboards, settings, onboarding, social and content creation rather than copying proprietary assets.

---

# 49. DESIGN REFERENCE WORKFLOW

Use the provided design resources intelligently.

For each major screen:

```text
Research references
 ↓
Extract design principles
 ↓
Create SocialFlow-specific design
 ↓
Implement reusable components
 ↓
Render in browser
 ↓
Visual audit
 ↓
Refine
```

Do not make the application look like a collage of unrelated component libraries.

All external components must be adapted into one SocialFlow design language.

---

# 50. IMPECCABLE DESIGN AUDIT

If the Impeccable skill/tool is installed, use it.

First establish product/design context.

Use its workflow for:

```text
init
document
audit
critique
polish
typeset
colorize
layout
animate
```

where relevant.

Impeccable is specifically designed to detect common AI-generated design problems and can produce a machine-readable `DESIGN.md`.

Run its detector against the final UI where available:

```text
npx impeccable detect src/
```

The detector checks things such as contrast, typography drift, overflow, brittle motion and design-system violations.

---

# 51. AGENTATION

If Agentation is installed, use it during visual QA.

Use annotations to identify:

* incorrect spacing
* bad alignment
* unclear hierarchy
* animation problems
* accessibility problems
* broken interactions

Agentation can provide structured element paths and React component context to coding agents.

Use it for development/QA unless the project's distribution license explicitly permits shipping it inside the commercial product.

---

# 52. FIGMA WORKFLOW

If Figma skills/tools are installed and available:

Use them for design-system planning and visual validation.

If implementing from an existing Figma design:

* load `figma-design-to-code` first
* use `get_design_context`
* adapt the returned reference to the actual project
* reuse existing project tokens/components

If creating/updating composed screens in Figma:

* use `figma-generate-design`
* also load `figma-use`
* reuse design-system components
* use tokens instead of hardcoded values

Do not invent Figma component mappings.

Do not call Figma mutation tools without the required prerequisite skills.

---

# 53. DESIGN SYSTEM FILES

Create/maintain:

```text
PRODUCT.md
DESIGN.md
```

if the chosen design workflow supports them.

`DESIGN.md` should define:

```text
Creative direction
Colors
Typography
Elevation
Components
Do / Don't rules
Motion rules
```

Do not create fake documentation that doesn't match the actual implementation.

---

# 54. TYPOGRAPHY

Do not automatically use Inter.

Choose a strong product typography system.

Example direction:

```text
Display:
premium modern grotesk

UI:
high-legibility sans

Data:
tabular/technical-friendly font behavior
```

Use:

* clear hierarchy
* optical sizing where supported
* proper line-height
* restrained letter spacing
* numeric alignment
* accessible minimum sizes

---

# 55. MOTION SYSTEM

Create reusable motion tokens:

```text
instant
fast
normal
slow
spring
emphasis
```

Use:

```text
fade
slide
scale
spring
parallax
depth
hover
press
stagger
```

Avoid animation on every element.

Respect:

```text
prefers-reduced-motion
```

When reduced motion is enabled:

* disable heavy particle effects
* disable large parallax
* reduce transitions
* disable unnecessary 3D movement

---

# 56. DASHBOARD UX

Dashboard should answer immediately:

```text
What is happening?
What changed?
What needs attention?
What should I do next?
```

Show:

* connected accounts
* account health
* scheduled posts
* failed posts
* published posts
* reach
* engagement
* follower growth
* top content
* recent activity
* upcoming schedule

Every metric must show:

```text
source
period
last updated
```

when appropriate.

---

# 57. SOCIAL ACCOUNTS PAGE

Make this one of the strongest screens.

Example:

```text
Connected Accounts

Meta
 ├── Facebook — Acme Official
 └── Instagram — @acme

X
 └── @acme

LinkedIn
 ├── Azaz Gori
 └── Acme Technologies
```

Each account:

```text
avatar
platform
name
username
status
capabilities
last sync
token health
```

Actions:

```text
Manage
Refresh
Reconnect
Disconnect
```

---

# 58. CONTENT CREATION UX

Build a premium content composer.

Layout:

```text
┌───────────────────────────────────────────┐
│ Content Composer                          │
├────────────────────┬──────────────────────┤
│ Editor              │ Live Preview        │
│                     │                      │
│ Caption             │ Platform Preview    │
│ Media               │                      │
│ AI                   │                    │
│ Platform selector   │                    │
│ Account selector    │                    │
│ Schedule            │                    │
└────────────────────┴──────────────────────┘
```

Allow platform/account-specific preview.

---

# 59. SMART VALIDATION

Before publish:

```text
✓ Account connected
✓ Permission valid
✓ Media valid
✓ Caption valid
✓ Provider supports selected content
✓ Schedule valid
✓ Timezone valid
✓ No duplicate delivery
```

If something is wrong:

```text
Instagram
⚠ Video aspect ratio is unsupported
[Fix]
```

Do not wait until the provider rejects it.

---

# 60. NOTIFICATION SYSTEM

Normalize:

```text
publish success
publish failure
account expired
permission revoked
rate limit
scheduled
comment
mention
system
```

Each notification should deep-link to the relevant object.

---

# 61. RESPONSIVE DESIGN

Test:

```text
320px
375px
390px
430px
768px
1024px
1280px
1440px
1920px
```

Do not simply shrink desktop UI.

Mobile must have:

* accessible navigation
* usable composer
* touch-friendly controls
* readable analytics
* usable calendar
* optimized 3D effects

Heavy WebGL should degrade on low-power devices.

---

# 62. ACCESSIBILITY

Every interaction must support:

* keyboard
* focus
* screen readers
* semantic HTML
* accessible labels
* sufficient contrast
* reduced motion

Do not sacrifice accessibility for 3D effects.

---

# 63. CLEAN UP THE REPOSITORY

Remove from Git tracking:

```text
node_modules
build output
temporary files
debug artifacts
local secrets
```

Ensure `.gitignore` covers:

```text
node_modules/
dist/
build/
.env
.env.*
!.env.example
```

Never commit real credentials.

`.env.example` must contain placeholders only.

---

# 64. SECURITY AUDIT

Perform a security review for:

* authentication
* authorization
* OAuth
* token storage
* CSRF where applicable
* XSS
* SSRF
* open redirects
* webhook signature verification
* rate limiting
* request validation
* file upload validation
* URL fetching
* AI prompt injection
* secret leakage
* error leakage

Especially audit URL-based AI repurposing features.

Do not allow arbitrary server-side URL fetching to become an SSRF vulnerability.

---

# 65. AI FEATURES

Audit:

* generation
* regeneration
* repurposing
* prompt handling
* output validation
* platform adaptation

AI output must never automatically publish without the user's intended action unless the user explicitly configured automation.

Never trust AI-generated URLs or tool instructions.

---

# 66. FINAL PRODUCT WORKFLOW

The final system should work like:

```text
User
 ↓
Login
 ↓
Workspace
 ↓
Connect social account
 ↓
OAuth
 ↓
Discover accounts
 ↓
Select account
 ↓
Validate permissions
 ↓
Initial sync
 ↓
Connected
 ↓
Create content
 ↓
AI generation
 ↓
Platform-specific editing
 ↓
Preview
 ↓
Select exact destination accounts
 ↓
Validate
 ↓
Publish now OR schedule
 ↓
Provider adapter
 ↓
Provider API
 ↓
Provider response
 ↓
Store provider post ID
 ↓
Track delivery
 ↓
Sync analytics/comments
 ↓
Dashboard
```

---

# 67. FINAL QA

After implementation, test every major flow manually and through automated tests.

### Account connection

* connect
* multiple accounts
* reconnect
* disconnect
* expired token
* revoked permission

### Publishing

* text
* image
* video
* platform-specific content
* multiple destinations
* partial failure
* retry
* duplicate prevention

### Scheduling

* future schedule
* timezone
* reschedule
* cancel
* failed scheduled post
* retry

### Analytics

* real data
* empty data
* API failure
* pagination
* date ranges
* comparison periods

### Workspace

* member
* admin
* owner
* viewer
* cross-workspace isolation

### UI

* dark
* light
* mobile
* desktop
* reduced motion
* keyboard
* loading
* empty
* error
* success

---

# 68. BUILD VALIDATION

Before declaring completion:

```text
install dependencies
typecheck
lint
unit tests
integration tests
build frontend
build backend
run application
test API
test OAuth
test scheduler
test publishing
test responsive UI
```

Fix all actual errors.

Do not hide errors with:

```text
@ts-ignore
eslint-disable
any
empty catch
```

unless there is a documented and justified reason.

---

# 69. FINAL REPORT

At the end provide:

## A. Architecture Audit

* frontend architecture
* backend architecture
* database architecture
* API architecture
* scheduler
* social provider architecture

## B. Social API Audit

For every provider:

```text
Connected?
OAuth working?
Account discovery?
Token handling?
Refresh?
Permissions?
Read APIs?
Write APIs?
Media?
Comments?
Analytics?
Webhooks?
Rate limits?
Retries?
```

## C. Fixed Logic

List every incorrect business logic fixed.

## D. Removed Dummy Data

List every dummy/mock/random data source removed.

## E. Remaining Dummy Data

If any remains:

```text
file
component
reason
replacement plan
```

Do not claim zero dummy data without verifying.

## F. UI/UX Changes

List:

* design system
* typography
* colors
* dark mode
* light mode
* 3D components
* animation
* responsive
* accessibility
* loading states
* error states
* empty states

## G. Security

List:

* OAuth improvements
* token protection
* authorization
* validation
* webhook security
* file security

## H. Performance

List:

* bundle improvements
* API optimization
* database indexes
* caching
* rendering improvements
* animation/WebGL optimization

## I. Tests

Report:

```text
passed
failed
not available
```

with exact details.

---

# 70. MOST IMPORTANT FINAL RULE

Do not optimize for:

> "The app looks impressive in a screenshot."

Optimize for:

> "The app is actually correct when a real user connects real Facebook, Instagram, X or LinkedIn accounts and uses the complete workflow."

The final product must be:

```text
REAL DATA
+
REAL PROVIDER APIs
+
REAL ACCOUNT CONNECTIONS
+
REAL PERMISSIONS
+
REAL PUBLISHING
+
REAL READ/SYNC
+
REAL ANALYTICS
+
REAL ERROR HANDLING
+
REAL SECURITY
+
REAL WORKSPACE AUTHORIZATION
+
PREMIUM UI/UX
+
DARK/LIGHT THEMES
+
3D ANIMATION
+
HIGH PERFORMANCE
```

No fake success.

No random metrics.

No guessed account.

No `accounts[0]`.

No fake "connected" state.

No fake "published" state.

No pretending unsupported provider features work.

When a provider does not support a capability, explicitly show that limitation instead of simulating it.

**Treat SocialFlow as a real multi-provider SaaS product, not a frontend demo.**
