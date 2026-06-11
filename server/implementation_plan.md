# Implementation Plan - SocialFlow AI (Unified Inbox Phase 5)

This plan details the implementation of a production-grade **Unified Inbox Module** (Phase 5) utilizing clean architecture principles (Model-Repository-Service-Controller-Routes pattern) to sync, filter, assign, resolve, and reply to comments with AI-powered context suggestions.

---

## User Review Required

> [!IMPORTANT]
> **Data Model Updates:**
> We will formalize the Mongoose `Comment` schema, ensuring it has explicit `workspaceId` fields or joins through `SocialAccount` to support robust multi-tenancy.
>
> **AI Reply Suggestion Prompts:**
> We will configure context-aware prompt templates that generate three specific tones:
> 1. **Professional**: Informative, formal, and corporate.
> 2. **Friendly**: Casual, warm, and emoji-friendly.
> 3. **Brand**: Conversion-oriented, aligned with brand personality.
> If the Groq/OpenRouter keys are missing in the local environment, the engine will dynamically compile mock response templates matching these tones to prevent service disruption.
>
> **Interactive Reply Action**:
> Replying to a comment will post the reply into the database's `replies` subdocument array, mark the comment status as `resolved`, and log the action in `ActivityLog`. In production mode, it would forward the request to the corresponding platform provider strategies.

---

## Proposed Changes

### Feature: Comments/Inbox Module
All code for this feature will be contained under the new directory `server/src/features/comment/`.

#### [NEW] [comment.model.ts](file:///d:/Git-Projects/SocialFlow/server/src/features/comment/comment.model.ts)
* Maps the mongoose model for comments.
* Tracks:
  * `workspaceId` (reference to workspaces)
  * `socialAccountId` (reference to social accounts)
  * `platform` (enum: x, linkedin, youtube, facebook, instagram)
  * `externalCommentId` (string)
  * `postTitle` (string)
  * `author` (username, displayName, avatarUrl)
  * `message` (string)
  * `status` (enum: unread, read, replied, resolved)
  * `assignedTo` (reference to users, optional)
  * `replies` (subdocument array of reply posts: author, message, isBrandReply, createdAt)

#### [NEW] [comment.repository.ts](file:///d:/Git-Projects/SocialFlow/server/src/features/comment/comment.repository.ts)
* Implements database CRUD functions:
  * `findCommentsByAccounts(accountIds, filters)`: Retrieves list of comments with sorting and criteria.
  * `findCommentById(id)`: Retrieves a comment by ID.
  * `updateComment(id, updateData)`: Applies updates to comment fields.
  * `pushReply(commentId, reply)`: Pushes a reply to the replies array.

#### [NEW] [comment.validation.ts](file:///d:/Git-Projects/SocialFlow/server/src/features/comment/comment.validation.ts)
* Declares Zod schemas:
  * `listCommentsQuerySchema`: Validates query filters (`platform`, `status`, `assignedTo`).
  * `replyCommentSchema`: Validates `{ commentId: string, message: string }`.
  * `resolveCommentSchema`: Validates `{ status: 'resolved' | 'unresolved' }`.
  * `assignCommentSchema`: Validates `{ assignedTo: string }`.
  * `suggestReplySchema`: Validates `{ commentId: string }`.

#### [NEW] [comment.service.ts](file:///d:/Git-Projects/SocialFlow/server/src/features/comment/comment.service.ts)
* Orchestrates business rules:
  * **Listing**: Validates user's workspace context and lists workspace comments.
  * **Replying**: Validates connection access, appends reply to comment, sets status to `replied`, logs activity, and sends notifications.
  * **Assignment**: Validates assigned user exists within the target workspace and assigns the comment.
  * **Resolution**: Switches resolution status.
  * **AI Suggestions**: Queries LLM (or mock fallback if config keys are empty) with prompts designed for Professional, Friendly, and Brand tones, returning all three options.

#### [NEW] [comment.controller.ts](file:///d:/Git-Projects/SocialFlow/server/src/features/comment/comment.controller.ts)
* HTTP controller mapping Express requests to `CommentService` and outputting standard `ApiResponse` objects.

#### [NEW] [comment.routes.ts](file:///d:/Git-Projects/SocialFlow/server/src/features/comment/comment.routes.ts)
* Declares endpoints:
  * `GET /api/comments` - Fetch inbox comments (filters supported).
  * `POST /api/comments/reply` - Submit a reply to a comment.
  * `PUT /api/comments/resolve/:id` - Mark resolved / unresolved.
  * `PUT /api/comments/assign/:id` - Assign to teammate.
  * `POST /api/comments/ai-suggestions` - Request AI suggestions.

---

## Integration Plan

### 1. Route Mounting
* Mount routes in [server.ts](file:///d:/Git-Projects/SocialFlow/server/src/server.ts) at `/api/comments`.

### 2. Swagger Documentation
* Add Swagger endpoint specifications under the `/comments` tags in [swagger.json](file:///d:/Git-Projects/SocialFlow/server/src/docs/swagger.json).

---

## Verification Plan

### Automated Tests
1. **Comment Service Unit Tests** (`comment.service.test.ts`):
   * Verify list filters, replies, resolution states, assignments, and AI suggestions.
2. **Comment API Integration Tests** (`comment.controller.test.ts`):
   * Test `/api/comments` endpoints using `supertest` with authentication headers.
3. Run: `npm run test`

### Manual Verification
* Run the dev server (`npm run dev`) and test comment retrievals and replies via HTTP REST requests.
