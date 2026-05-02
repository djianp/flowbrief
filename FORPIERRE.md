# FlowBrief: The Story So Far

*A learning journal for Pierre — updated as the project evolves*

---

## What Are We Building?

Imagine you have a bunch of automated workflows running in n8n — maybe one that monitors your Stripe payments, another that tracks form submissions, another that watches your calendar. Each of these workflows generates data, but that data just... sits there. You'd have to log into each service, check dashboards, piece together what's happening.

**FlowBrief is your personal briefing assistant.** It's the glue between your automations and your brain. Your n8n workflows send data to FlowBrief, and it gives you back a human-readable summary: "Hey, you got 3 new payments totaling $147 today. Here's what you should do next."

Think of it like having a personal assistant who reads all your automated notifications and gives you the highlights over coffee.

---

## The Big Picture: How Everything Connects

```
┌─────────────────┐      webhook POST       ┌─────────────────┐
│                 │ ─────────────────────▶  │                 │
│   n8n Workflow  │    /api/ingest/:userId  │   FlowBrief     │
│                 │                         │                 │
└─────────────────┘                         └────────┬────────┘
                                                     │
                                            ┌────────┴────────┐
                                            │   Validation    │
                                            │   Layer         │
                                            └────────┬────────┘
                                                     │
                                          ┌──────────┴──────────┐
                                          │                     │
                                    ❌ Invalid              ✅ Valid
                                          │                     │
                                          ▼                     ▼
                                   ┌─────────────┐      ┌─────────────┐
                                   │ Structured  │      │  SQLite DB  │
                                   │ Error + Log │      │ (via Prisma)│
                                   └─────────────┘      └──────┬──────┘
                                                               │
                                                               ▼
                                                       ┌─────────────┐
                                                       │  Dashboard  │
                                                       │ (React/Next)│
                                                       └─────────────┘
```

Here's the flow:

1. **Your n8n workflow** finishes doing something (payment received, form submitted, whatever)
2. **It POSTs the data** to your personal webhook URL: `/api/ingest/YOUR_USER_ID`
3. **FlowBrief validates** the request through multiple layers (method, content-type, size, JSON, schema)
4. **If invalid:** Returns a structured error with `errorCode` + `errorDetails`, logs `webhook_failed`
5. **If valid:** Saves the payload as a "Brief", logs `webhook_received`
6. **You see it** on your dashboard, nicely formatted

---

## The Tech Stack (And Why We Chose It)

### Next.js 16 with App Router

We're using the latest Next.js with the App Router pattern. Why?

**The Old Way (Pages Router):** Every page lives in `/pages`, API routes in `/pages/api`. It works, but mixing frontend and backend felt messy.

**The New Way (App Router):** Everything lives in `/app`. A folder IS a route. Want a dashboard? Create `/app/dashboard/page.tsx`. Want an API endpoint? Create `/app/api/ingest/route.ts`. It's more intuitive.

The App Router also gives us **React Server Components** by default. This is a game-changer: components can be async, fetch data directly, and only send HTML to the browser. The dashboard page is a server component — it fetches briefs from the database before the page even loads. No loading spinners, no client-side fetching. Just... content.

```tsx
// This runs on the server, not in the browser!
export default async function DashboardPage() {
  const session = await auth();
  const briefs = await getUserBriefs(session.user.id);

  return <BriefsList briefs={briefs} />;
}
```

### TypeScript

JavaScript but with guardrails. When you define a Brief like this:

```typescript
interface Brief {
  id: string;
  status: "SUCCESS" | "FAILED";
  summaryText: string;
  actionItemsJson: string[];
}
```

...the compiler catches mistakes before they blow up at runtime. Tried to access `brief.sumarryText` (typo)? TypeScript screams at you. Saved me hours of debugging.

### SQLite + Prisma

For a project like this, SQLite is perfect. It's just a file. No Docker containers, no database servers, no connection strings to manage. Your entire database lives in `prisma/dev.db`.

**Prisma** is the ORM (Object-Relational Mapper). Instead of writing raw SQL like:

```sql
INSERT INTO briefs (id, userId, status, summaryText) VALUES (?, ?, ?, ?);
```

You write:

```typescript
await prisma.brief.create({
  data: { userId, status, summaryText }
});
```

Same result, but type-safe, readable, and the schema is version-controlled.

### NextAuth v5 (Beta)

Authentication is one of those things that seems simple ("just check if they're logged in!") until you try to build it yourself. Sessions, tokens, password hashing, CSRF protection... it's a minefield.

NextAuth handles all of it. You configure your "providers" (we use credentials — email/password), and it gives you:
- A `signIn()` function
- A `signOut()` function
- An `auth()` function that returns the current session
- Protected API routes
- Session management with JWTs

**Why v5 (beta)?** It's the version that works well with Next.js App Router. The stable v4 was designed for Pages Router and has friction with the new patterns.

---

## The Codebase: A Guided Tour

### `/src/lib` — The Brains

This is where the business logic lives. These files don't know about HTTP or React — they just do their job.

**`prisma.ts`** — A singleton for the database connection. "Singleton" means there's only one instance, shared everywhere. Without this, each request would open a new database connection, and we'd run out.

**`auth.ts`** — Configures NextAuth. Defines how login works, what happens after login, how sessions are stored.

**`briefs.ts`** — Functions for creating and fetching briefs. `createBrief()`, `getUserBriefs()`, `getLastSuccessBrief()`. Pure logic, no HTTP.

**`webhook-errors.ts`** — The `ErrorCode` enum and response helper functions. Defines all the ways a webhook can fail (`INVALID_JSON`, `MISSING_REQUIRED_FIELD`, etc.) and provides `createErrorResponse()` / `createSuccessResponse()` for consistent formatting.

**`webhook-validation.ts`** — Payload schema validation. Defines what a valid webhook payload looks like (required: `title`, `content`; optional: `source`, `timestamp`) and validates incoming data against it.

**`request-utils.ts`** — Utilities for safely reading request bodies and extracting metadata for logging:
- `truncate(str, maxLen)` — Safely truncate strings (used for rawBody in failure logs)
- `pickHeaders(headers)` — Extract only whitelisted headers (content-type, user-agent, x-flowbrief-signature, x-forwarded-for)
- `safeReadBody(request)` — Read request body once without throwing (returns null on failure)
- `extractRequestMeta(request, rawBody)` — Build metadata object for `webhook_received` events
- `buildFailureProperties(...)` — Build full context for `webhook_failed` events

**`events.ts`** — Analytics/logging. Every webhook received, every brief generated — we log it. Useful for debugging.

**`ai.ts`** — The AI integration (currently unused in the ingest path, but available for future features). Has a graceful fallback pattern if OpenAI isn't configured.

### `/src/app/api` — The Endpoints

Each folder here becomes an API route.

**`/api/ingest/[userId]/route.ts`** — The star of the show. This is where n8n sends data. The `[userId]` is a dynamic segment — the URL `/api/ingest/abc123` will receive `userId = "abc123"` as a parameter.

This endpoint implements a strict validation pipeline:

1. **Method check** — Only POST allowed (returns `INVALID_METHOD` for GET/PUT/DELETE/PATCH)
2. **User check** — userId must exist in database (returns `USER_NOT_FOUND` 404). Done early so all logging uses a FK-safe userId.
3. **Content-Type check** — Must be `application/json` (returns `UNSUPPORTED_CONTENT_TYPE`)
4. **Size check** — Max 20KB via header AND body (returns `PAYLOAD_TOO_LARGE`)
5. **JSON parse** — Body must be valid JSON (returns `INVALID_JSON`)
6. **Schema validation** — Must have `title` and `content` fields (returns `MISSING_REQUIRED_FIELD` or `INVALID_FIELD_TYPE`)
7. **Logging** — Every request logs `webhook_received`; failures also log `webhook_failed` with error details. Unknown users get `userId: null` with `attemptedUserId` in properties.
8. **Save** — Valid payloads are stored as Briefs
9. **Return** — `{ ok: true }` on success, `{ ok: false, errorCode, errorDetails }` on failure

**`/api/test-payload/route.ts`** — Calls the ingest endpoint with fake data. Great for testing without setting up n8n.

**`/api/activation-status/route.ts`** — Returns whether a user has successfully received their first brief. The dashboard uses this to show "Set up your webhook!" vs "You're all set!"

**`/api/activation-debug/route.ts`** — A token-protected endpoint for n8n to fetch detailed debug context when activation fails. Requires `x-internal-token` header matching `INTERNAL_API_TOKEN` env var. Returns:
- `activated`: whether user has at least one SUCCESS brief
- `lastAttemptAt`: most recent webhook attempt
- `lastFailure`: full context of most recent `webhook_failed` event (errorCode, errorDetails, rawBody, headers)
- `recentFailures`: last 5 failures with timestamps and error codes
- `lastReceived`: most recent `webhook_received` event metadata

This is what the AI Rescue workflow calls to diagnose why activation failed.

### `/src/app/dashboard` — The UI

**`page.tsx`** — A server component that fetches briefs and renders the dashboard. It imports all the client components (buttons, lists) and passes them data.

**`briefs-list.tsx`** — Renders a list of briefs with their status, summary, and action items.

**`webhook-url.tsx`** — Displays your personal webhook URL with a copy button.

**`test-payload-button.tsx`** — Calls `/api/test-payload` to trigger a test brief.

**`sign-out-button.tsx`** — A client component (needs `"use client"` because it uses `onClick`).

### The Pattern: Server Components + Client Components

Notice how `page.tsx` doesn't have `"use client"` at the top? It's a **server component**. It can:
- Be `async`
- Fetch data directly with `await`
- Access the database
- Use secrets (environment variables)

But it can NOT:
- Use `useState` or `useEffect`
- Handle click events
- Use browser APIs

For interactivity, we create **client components** (marked with `"use client"`). The server component renders them and passes data as props.

```tsx
// Server component
export default async function DashboardPage() {
  const briefs = await getUserBriefs(userId);  // runs on server
  return <BriefsList briefs={briefs} />;       // passes data to client
}

// Client component
"use client";
export function BriefsList({ briefs }) {
  // Can use useState, onClick, etc. here
}
```

This separation is powerful. The server does the heavy lifting, the client handles interactivity. Best of both worlds.

---

## Lessons Learned

### The Activation Status Bug (Current Branch: `feature/activation-debug`)

*This section will be updated as we debug...*

We have an endpoint `/api/activation-status` that tells us if a user's webhook is "activated" (has successfully processed at least one brief). The dashboard was supposed to show different states:
- "Not yet activated" → Set up your webhook!
- "Activated" → You're all set, here are your briefs

Somewhere, something isn't quite working. The debugging process is a lesson in itself:

1. **Start from the data.** What's actually in the database? Use `npm run db:studio` to inspect.
2. **Trace the request.** Add `console.log()` statements at each step.
3. **Test in isolation.** Hit the API directly with `curl` before blaming the frontend.

### SQLite + JSON: The Stringify Dance

SQLite doesn't have a native JSON column type. So we store JSON as strings:

```typescript
// Saving
inputJson: JSON.stringify(payload)

// Reading
JSON.parse(brief.inputJson)
```

It's slightly annoying, but it works. The pitfall: forget to parse and you'll get `"[object Object]"` everywhere.

**Lesson:** When using SQLite with JSON data, create helper functions that handle the conversion, so you don't have to remember every time.

### NextAuth v5 Session Quirk

By default, NextAuth uses database sessions. But with credentials auth (email/password), we need **JWT sessions**. Why? Database sessions require a session token stored in a cookie AND the database. JWTs are self-contained — the session lives entirely in the cookie.

```typescript
export const { auth } = NextAuth({
  session: { strategy: "jwt" },  // <-- This line is crucial
  // ...
});
```

Without this, you'll get cryptic errors about missing session tokens.

### The Graceful Fallback Pattern

Look at `ai.ts`:

```typescript
export async function generateBrief(inputJson: unknown): Promise<BriefResult> {
  const openaiKey = process.env.OPENAI_API_KEY;

  if (openaiKey) {
    return generateWithOpenAI(inputJson, openaiKey);
  }

  return generateFallback(inputJson);  // Works without API key!
}
```

This is a **graceful degradation** pattern. The app doesn't break if OpenAI isn't configured — it just does something simpler. Benefits:
- New developers can run the project immediately (no API key signup required)
- If OpenAI goes down, the app still works
- Tests don't need mocked API responses

**Lesson:** Always ask "What if this dependency fails?" and have a fallback plan.

### Error Taxonomy: Speaking n8n's Language

*Added: February 2, 2026*

When we first built the webhook endpoint, errors looked like this:

```json
{ "ok": false, "error": "Invalid JSON payload" }
```

Simple, human-readable... and useless for automation. If an n8n workflow received this, what could it do? Log it and give up? Send a generic alert?

We needed **structured errors** — a vocabulary that both humans and machines understand. So we created an `ErrorCode` enum:

```typescript
export enum ErrorCode {
  INVALID_JSON = "INVALID_JSON",
  UNSUPPORTED_CONTENT_TYPE = "UNSUPPORTED_CONTENT_TYPE",
  MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",
  INVALID_FIELD_TYPE = "INVALID_FIELD_TYPE",
  PAYLOAD_TOO_LARGE = "PAYLOAD_TOO_LARGE",
  INVALID_METHOD = "INVALID_METHOD",
  UNAUTHORIZED = "UNAUTHORIZED",
  USER_NOT_FOUND = "USER_NOT_FOUND",
}
```

Now n8n can do this:

```
IF errorCode == "MISSING_REQUIRED_FIELD" → Send user an email with field requirements
IF errorCode == "INVALID_JSON" → Send user a JSON formatter link
IF errorCode == "UNAUTHORIZED" → Check if userId is correct in their config
```

The `errorDetails` object provides context without breaking the contract:

```json
{
  "ok": false,
  "errorCode": "MISSING_REQUIRED_FIELD",
  "errorDetails": {
    "field": "title",
    "message": "Required field 'title' is missing"
  }
}
```

**The lesson:** When building APIs for automation, think about the *consumer* of your errors. Strings are for humans. Codes are for machines. You need both.

### The Payload Schema: Required vs Optional

We also defined a minimal schema for webhook payloads:

```typescript
interface WebhookPayload {
  title: string;      // Required: What is this about?
  content: string;    // Required: The actual data/message
  source?: string;    // Optional: Where did this come from?
  timestamp?: string; // Optional: When did it happen? (ISO 8601)
}
```

Why these fields?

- **`title`** — Every brief needs a headline. This becomes the `summaryText` in the database.
- **`content`** — The actual information. Can be as short or long as needed (up to 20KB).
- **`source`** — Useful for filtering/grouping. "Was this from Stripe? Calendar? Forms?"
- **`timestamp`** — When the event *actually* happened, not when we received it. Important for audit trails.

The timestamp validation is strict — it must be a valid ISO 8601 string (`2026-02-02T15:30:00.000Z`). No loose date parsing, no timezone ambiguity. This prevents subtle bugs where "2/2/26" means different things to different systems.

### Payload Size Limits: Defense in Depth

The ingest endpoint checks payload size twice (limit: **20KB**):

```typescript
const MAX_PAYLOAD_SIZE = 20 * 1024; // 20KB

// First check: Content-Length header (fast, before reading body)
const contentLength = request.headers.get("content-length");
if (contentLength && parseInt(contentLength) > MAX_PAYLOAD_SIZE) { ... }

// Second check: Actual body length (after reading)
if (rawBody.length > MAX_PAYLOAD_SIZE) { ... }
```

Why both? The `Content-Length` header can be spoofed or missing. A malicious request could say "I'm 100 bytes" but send 100MB. The header check is fast (doesn't read the body), but we verify after reading too.

Why 20KB? It's enough for any reasonable webhook payload (a Stripe event is ~2KB, a form submission ~1KB), but small enough to prevent abuse. If someone genuinely needs to send more, they should rethink their data model.

**Lesson:** Never trust client-supplied data. Validate at multiple levels.

### Dual Logging: Received vs Failed

The ingest endpoint logs two different events:

```typescript
// Always logged (even for invalid requests)
await logEvent({ userId, eventName: "webhook_received", ... });

// Only logged when validation fails
await logEvent({ userId, eventName: "webhook_failed", ... });
```

Why both?

- **`webhook_received`** answers: "Did the request reach us?" Useful for debugging network issues.
- **`webhook_failed`** answers: "Why did it fail?" Contains the error code, details, raw body, and headers.

The `webhook_failed` event captures the full request context — including the raw body (truncated to 20KB) and whitelisted headers. This means when n8n's rescue workflow checks why activation failed, it has everything it needs to diagnose the problem without asking the user to reproduce it.

**Lesson:** Log at the boundaries of your system. Capture enough context to debug without the user's help.

### The Foreign Key Crash: USER_NOT_FOUND (Bug Fix)

*Added: February 3, 2026*

This one was a real "oh no" moment. We discovered that hitting `/api/ingest/fake-user-id` with a userId that doesn't exist would crash with a Prisma error:

```
P2003: Foreign key constraint violated on the field `Event_userId_fkey`
```

**What happened:** Our `Event` table has a foreign key from `Event.userId` to `User.id`. The ingest route was calling `logEvent({ userId: "fake-user-id", ... })` *before* checking if the user exists — and Prisma rightfully refused to insert an Event pointing to a non-existent User.

It's like trying to file a document in a cabinet drawer that doesn't exist. The database said "nope."

**The fix was about \*ordering***** and \*****nullability**\***:**

1. **Move the user check to the top.** Before logging anything, check if the user exists.
2. **Compute a "safe" userId:** If user exists, use their real id. If not, use `undefined` (which Prisma stores as `null`).
3. **Stash the attempted id in properties:** So we don't lose the forensic trail — the `attemptedUserId` is preserved in the event's JSON.

```typescript
const user = await prisma.user.findUnique({ where: { id: paramUserId } });
const safeUserId = user ? paramUserId : undefined;

// Now safe to log — userId is either valid or null
await logWebhookReceived(safeUserId, paramUserId, request, rawBody);
```

We also added `USER_NOT_FOUND` as a proper error code (with HTTP 404) instead of the previous `UNAUTHORIZED` (401). "Unauthorized" implies bad credentials; "User not found" is the accurate diagnosis.

**Lesson:** When your database has foreign keys, you need to validate references *before* inserting. This sounds obvious in hindsight, but it's easy to miss when the "insert" is buried inside a helper function (like `logEvent`). Think about the order of operations: validate first, log safely, then fail with a clear message.

---

## How Good Engineers Think

### Start Simple, Add Complexity Only When Needed

FlowBrief started as:
1. An endpoint that receives JSON
2. A database to store it
3. A page to display it

No AI summarization at first. No auth. No event tracking. Each feature was added when there was a clear need. This is called **YAGNI** — "You Aren't Gonna Need It." Build what you need today.

### Separation of Concerns

Notice how `/lib/briefs.ts` doesn't know about HTTP? It just has functions like `createBrief(data)`. The API route calls these functions and handles the HTTP stuff (status codes, headers, JSON responses).

If tomorrow we wanted a CLI tool that creates briefs, we could import `createBrief()` and use it directly. The logic isn't trapped inside an HTTP handler.

### Fail Fast, Fail Loudly

Look at the ingest endpoint's validation:

```typescript
if (!contentType.includes("application/json")) {
  return NextResponse.json(
    createErrorResponse(ErrorCode.UNSUPPORTED_CONTENT_TYPE, {
      expected: "application/json",
      received: contentType || "none",
    }),
    { status: 415 }
  );
}
```

It doesn't try to "be helpful" and guess the content type. If something's wrong, it fails immediately with a **structured error**. The response always looks like:

```json
{
  "ok": false,
  "errorCode": "UNSUPPORTED_CONTENT_TYPE",
  "errorDetails": { "expected": "application/json", "received": "text/plain" }
}
```

This is crucial for automation. n8n workflows can now branch on `errorCode` and take different actions for different failure types. A human-readable error message is nice, but a machine-readable error code is essential for building reliable integrations.

---

## n8n Workflows (via Synta MCP)

*Added: February 2, 2026*

We're using **Synta MCP** to manage n8n workflows directly from Claude Code. This gives us programmatic control over workflow creation, validation, and management without touching the n8n UI.

### Workflow 1: Paid conversion → Activation rescue loop (FlowBrief)

**ID:** `Xs7MPdACbBYwXruW`
**Status:** Active
**Webhook Path:** `/webhook/paid-conversion`

A simple activation SLA workflow that monitors new paid users:

```
Webhook (POST) → Slack Notify → Wait 45m → HTTP Check Activation → IF Activated?
                                                                      ↓ TRUE → Slack ✅
                                                                      ↓ FALSE → Slack ⚠️
                                                    (on HTTP error) → Slack ❌
```

**What it does:**
1. Receives `{ userId, email, plan }` via webhook
2. Posts to #n8n: "New paid user: {email} (plan: {plan}). Activation SLA starts now."
3. Waits 45 minutes (the activation SLA window)
4. Checks `/api/activation-status?userId={userId}`
5. Posts success or failure message to Slack

**Test with:**
```bash
curl -X POST "https://<n8n-instance>/webhook/paid-conversion" \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-123", "email": "test@example.com", "plan": "pro"}'
```

---

### Workflow 2: Activation SLA + AI Rescue Loop (FlowBrief)

**ID:** `CJY7NTNz0UCzYxG4`
**Status:** Active (Published in n8n)
**Webhook Path:** `/webhook/flowbrief/new-user`

A comprehensive activation monitoring workflow with AI-powered rescue:

```
Webhook → Normalize → Slack SLA → Wait 30s → HTTP Status → IF Activated?
                                                              ↓ TRUE → Slack ✅
                                                              ↓ FALSE ↓
                                                        HTTP Debug (with x-internal-token)
                                                              ↓
                                                        Switch on errorCode
                                              ┌───────────┼───────────┼───────────┐
                                           MISSING    INVALID    CONTENT     DEFAULT
                                            FIELD       JSON       TYPE
                                              ↓           ↓          ↓           ↓
                                           Set Fix    Set Fix    Set Fix    Set Fix
                                              └───────────┴──────────┴───────────┘
                                                              ↓ Merge
                                                        Build AI Input
                                                              ↓
                                                   OpenAI Diagnose + Draft
                                                              ↓
                                                        Parse AI JSON
                                                              ↓
                                                     Slack Rescue Demo
                                                              ↓
                                                         Wait 30s
                                                              ↓
                                                      HTTP Retry Check
                                                              ↓
                                                   IF Activated after rescue?
                                                      ↓ TRUE        ↓ FALSE
                                                  Slack ✅       Slack ⚠️
                                                  Succeeded      Escalate
```

**Key Features:**
- **Normalize input node** extracts `userId`, `email`, `plan`, plus sets `flowbriefBaseUrl` and `internalToken` (from env)
- **Error code branching** provides specific fix suggestions per error type
- **AI diagnosis** uses GPT-4o to analyze the failure and generate:
  - Root cause analysis
  - Fix steps
  - Example curl command
  - Draft rescue email (subject + body)
- **Retry loop** checks activation again after sending rescue instructions

**Credentials Used:**
| Service | Credential Name | Status |
| --- | --- | --- |
| Slack | `Slack - FlowBrief` (ID: rb1PCEAd3QWpcuVE) | ✅ Configured |
| OpenAI | `OpenAI` | ✅ Configured |

**Environment Variables Needed:**
- `INTERNAL_API_TOKEN` — Used in the `x-internal-token` header for debug endpoint

**Wait Times (for testing):**
Both Wait nodes are set to **30 seconds**. To change to production (45 minutes):
- Open workflow in n8n
- Edit "Wait - Activation SLA" and "Wait - Retry" nodes
- Change `amount` to 45, `unit` to "minutes"

**Test with:**
```bash
curl -X POST "https://<n8n-instance>/webhook-test/flowbrief/new-user" \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-123", "email": "test@example.com", "plan": "pro"}'
```

---

### Synta MCP Tools Reference

These are the n8n management tools available via MCP:

| Tool | Purpose |
| --- | --- |
| `search_nodes` | Find n8n nodes by keyword |
| `get_node` | Get node schema, docs, or raw definition |
| `search_templates` | Search n8n.io templates |
| `get_template` | Get template details |
| `n8n_create_workflow` | Create a new workflow |
| `n8n_get_workflow` | Get workflow by ID |
| `n8n_list_workflows` | List all workflows |
| `n8n_update_partial_workflow` | Incremental updates (add/remove nodes) |
| `n8n_update_full_workflow` | Full workflow replacement |
| `n8n_delete_workflow` | Delete a workflow |
| `n8n_validate_workflow` | Validate workflow config |
| `n8n_autofix_workflow` | Auto-fix common issues |
| `n8n_test_workflow` | Test/trigger workflow execution |
| `n8n_manage_credentials` | Check/create credentials |
| `visual_capture` | Render workflow as PNG |

---

## What's Next?

*This section tracks upcoming work and ideas...*

### Completed
- [x] **Error taxonomy + payload validation** — Structured error codes, required payload schema, machine-readable failure signals
- [x] **Dual webhook logging** — Every request logs `webhook_received` with metadata; failures also log `webhook_failed` with full context (errorCode, rawBody, headers)
- [x] **Activation debug endpoint** — Token-protected `/api/activation-debug` endpoint for n8n to fetch diagnostic context
- [x] **USER\_NOT\_FOUND fix** — Unknown userId no longer crashes with Prisma FK violation; returns clean 404, logs events with `userId: null` + `attemptedUserId` in properties
- [x] **OpenAI credential configured + AI rescue loop tested end-to-end** — Workflow 2 is Published in n8n and running successfully
- [x] **Published to GitHub** — Repo at https://github.com/djianp/flowbrief; README rewritten to lead with the n8n agent story, FlowBrief framed as the substrate

### Backlog
- [ ] Add webhook authentication (so only n8n can call the endpoint)
- [ ] Email notifications when briefs are generated
- [ ] Multiple AI providers (Claude, Gemini, local models)
- [ ] Add more error code cases to Switch node as we discover them

---

*Last updated: May 2, 2026 at 13:11 CET — Marked Workflow 2 as Active, OpenAI credential as Configured; checked off the rescue-loop E2E test; added GitHub publish to Completed*
