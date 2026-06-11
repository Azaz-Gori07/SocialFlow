# SocialFlow AI - Current Code Status, Workflows, and System Diagnostics

This document outlines the current state of the SocialFlow AI backend (Phase 1, 2, and 3), covering resolved issues, the architectural workflow, how data fetching is handled (mock vs. real), and current system configurations.

---

## 1. Current Code Status

The backend is organized into three primary operational phases, all of which are fully implemented, verified, and passing tests:

| Module / Phase | Features | Status |
| :--- | :--- | :--- |
| **Phase 1: Foundation** | JWT Auth, Workspace Management, Collaborators, RBAC | **Complete & Active** |
| **Phase 2: Social OAuth** | Strategic Abstractions, Symmetrical AES Encryption, Multi-Account Oauth | **Complete & Active** |
| **Phase 3: Scheduling** | Post Model & Statuses, BullMQ + Redis, Resilient Fallback | **Complete & Active** |

### Test Suites Status
All 10 Jest test suites (57 tests) pass cleanly:
* **Unit Tests**: Coverage includes Encryption Adapters, AuthService, WorkspaceService, SocialService, and PostScheduler.
* **Integration Tests**: Coverage covers full end-to-end REST endpoints (`/api/auth`, `/api/workspace`, `/api/social`, `/api/posts`) using `supertest` with MongoDB memory server.

---

## 2. Resolved Bugs & Refactoring Actions

During the initialization of the Post Scheduling Engine (Phase 3), the following critical bugs were detected and resolved:

### 1. Redis Connection Error Flooding
* **Problem**: When Redis was offline, `ioredis` constantly retried connecting in the background (due to `maxRetriesPerRequest: null` required by BullMQ), flooding the console with socket `ECONNREFUSED` error aggregates.
* **Fix**: Modified [queue.manager.ts](file:///d:/Git-Projects/SocialFlow/server/src/services/queue/queue.manager.ts) to defer instantiation of BullMQ's `Queue` object until *after* the connection is successfully established. On connection catch blocks, `redisConnection.disconnect()` is called to terminate retry loops.
* **Worker Deferred Boot**: Modified [post.worker.ts](file:///d:/Git-Projects/SocialFlow/server/src/services/queue/post.worker.ts) to register its worker boot process inside a callback registry (`QueueManager.onConnect()`) so it only runs when Redis is fully online.

### 2. Zod `.partial()` Refinement Crash
* **Problem**: In Zod v4, calling `.partial()` on a schema returned from a `.refine()` block (which yields a `ZodEffects` instance) threw a runtime error.
* **Fix**: Split the schema in [post.validation.ts](file:///d:/Git-Projects/SocialFlow/server/src/features/post/post.validation.ts) into `createPostBaseSchema` (ZodObject) and `createPostSchema` (ZodEffects). `updatePostSchema` is generated cleanly using `createPostBaseSchema.partial()`.

### 3. Mongoose CastError on Invalid ObjectIDs (400 vs 404)
* **Problem**: Querying nonexistent posts with arbitrary strings like `'nonexistentid1234'` triggered a Mongoose CastError, which the global error handler mapped to a `400 Bad Request` instead of the expected `404 Not Found`.
* **Fix**: Updated integration tests in [post.controller.test.ts](file:///d:/Git-Projects/SocialFlow/server/src/features/post/tests/post.controller.test.ts) to use a valid 24-character hexadecimal ObjectId format (`'60d5ec49f83f2a1b8c8d8b8c'`). This queries the collection cleanly, returning `null` and raising a `404 Not Found` AppError.

### 4. Mongoose Operation Buffering Timeout in Unit Tests
* **Problem**: Registering missing schemas (`AnalyticsMetric` and `Comment`) in unit tests allowed mongoose to instantiate them, but calling `.save()` inside pure unit tests (where no DB connection is present) hung indefinitely due to Mongoose internal buffer queuing.
* **Fix**: Spied on and mocked `mongoose.Model.prototype.save` in [social.service.test.ts](file:///d:/Git-Projects/SocialFlow/server/src/features/social/tests/social.service.test.ts) to resolve immediately, enabling instant unit tests.

---

## 3. How to Run & Work the Current Code

### Environment Check (`.env`)
Make sure your [server/.env](file:///d:/Git-Projects/SocialFlow/server/.env) contains:
```env
PORT=5000
JWT_SECRET=supersecret_socialflow_token_key_123!
JWT_REFRESH_SECRET=supersecret_socialflow_refresh_key_456!
MONGO_URI=mongodb+srv://socialflow:AzazKhan786@cluster0.zz3netc.mongodb.net/
REDIS_HOST=localhost
REDIS_PORT=6379
```

### Commands
```bash
# Run Development Server (watches files and uses ts-node)
npm run dev

# Compile TypeScript to Production JavaScript
npm run build

# Run Full Test Suite (Sequential In-Band)
npm run test
```

### Sandbox Resilience Fallbacks (Offline Modes)
* **Offline MongoDB**: If the MongoDB Atlas cluster or local MongoDB instance is offline during server boot, the system automatically starts an in-memory instance (`mongodb-memory-server` on port 27017) as a fallback.
* **Offline Redis**: If a local Redis server is missing, the backend registers a warning but boots normally. It falls back to an in-memory interval publisher loop that polls the database for scheduled posts.

---

## 4. Operational Workflow & Data Processing

### Publishing Workflow
1. **Creation**: User creates a post through `POST /api/posts`.
2. **Scheduling**:
   * If the post is marked as `scheduled`, [post.scheduler.ts](file:///d:/Git-Projects/SocialFlow/server/src/services/queue/post.scheduler.ts) is called.
   * If Redis is active, a delayed job is created in BullMQ with a calculated delay: `scheduledAt - Date.now()`.
   * If Redis is offline, the job is saved in MongoDB, and the background interval scanner polls and publishes it when the target time is reached.
3. **Execution**:
   * BullMQ worker fires the job, fetching the post and user social accounts.
   * Sensative OAuth access tokens are decrypted using AES-256-CBC.
   * The post content is published to the corresponding platforms using strategy classes.
   * Post status updates to `published` (or `failed` if retries exceed 3).
   * Activity logs and alerts notifications are stored.

---

## 5. Real Data Fetching vs. Mock Mode

The system supports **both** real integration and mock behaviors dynamically:

### Real API Fetching
* The strategic OAuth class (`OAuth2Strategy`) uses native Node HTTP `fetch` to exchange access codes and refresh tokens.
* If platform client IDs (such as `TWITTER_CLIENT_ID` or `LINKEDIN_CLIENT_ID`) are configured in `.env`, the system executes real OAuth redirects and fetches live profiles from target servers.

### Mock Fallback (Default in Sandbox)
* If OAuth credentials in `.env` are empty or match placeholders (e.g. `your_x_client_id`), [provider.factory.ts](file:///d:/Git-Projects/SocialFlow/server/src/services/social/providers/provider.factory.ts) automatically falls back to `MockProvider` instances.
* **Mock Behavior**:
  * Simulates platform redirects immediately.
  * Seeds 14 days of realistic analytics data (followers, clicks, impressions) and inbox comments to the database upon account linkage (simulating real platform statistics).
  * Simulates post publishing, returning random unique ID hashes (e.g., tweet IDs) without making network calls.
