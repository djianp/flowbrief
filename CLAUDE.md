# FlowBrief

A Next.js application that receives webhook data from n8n workflows and generates AI-powered briefs.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **Database**: SQLite via Prisma ORM
- **Authentication**: NextAuth v5 (beta) with credentials provider

## Project Structure

```
src/
├── app/
│   ├── (auth)/              # Auth pages (login, signup)
│   ├── api/
│   │   ├── auth/            # NextAuth routes + registration
│   │   ├── ingest/[userId]/ # Webhook endpoint for n8n
│   │   ├── activation-status/  # Check if user is activated
│   │   ├── activation-debug/   # Token-protected debug context for n8n
│   │   ├── events/          # Event tracking API
│   │   └── test-payload/    # Testing endpoint
│   └── dashboard/           # Main user dashboard
├── lib/
│   ├── auth.ts              # NextAuth configuration
│   ├── prisma.ts            # Prisma client singleton
│   ├── briefs.ts            # Brief CRUD operations
│   ├── webhook-errors.ts    # ErrorCode enum + response helpers
│   ├── webhook-validation.ts # Payload schema validation
│   ├── request-utils.ts     # Safe body reading + logging metadata + redaction chokepoint
│   ├── redact.ts            # PII/secret redaction (applied in request-utils)
│   ├── rescue-prompt.ts     # Vendored n8n rescue prompt — single source of truth
│   ├── events.ts            # Event tracking utilities
│   ├── ai.ts                # AI brief generation (OpenAI + offline fallback)
│   └── brief-enrichment.ts  # Background brief enrichment (Next after(), runs post-response)
└── prisma/
    └── schema.prisma        # Database schema

tests/                       # Vitest unit + integration + contract tests (npm test)
evals/                       # LLM eval harness, hits OpenAI (npm run eval)
```

## Key Commands

```bash
npm run dev        # Start development server
npm run build      # Build for production
npm test           # Run the Vitest suite (offline, fast)
npm run test:watch # Vitest in watch mode
npm run eval       # Run the LLM eval harness (hits OpenAI — see evals/README.md)
npm run db:push    # Push Prisma schema to database
npm run db:studio  # Open Prisma Studio
```

## Testing & Evals

Two layers, kept deliberately separate:

- **`npm test`** — Vitest. Hermetic, offline, fast, zero-config. Unit tests are co-located as `src/lib/*.test.ts`; integration tests (against a throwaway SQLite DB) and the cross-system contract lock live under `tests/`. A Vitest `globalSetup` runs `prisma db push` against `prisma/test.db` (gitignored); the test environment (`DATABASE_URL`, a fixed test token) is set in code under `tests/setup/`, so there's no env file to create.
- **`npm run eval`** — the LLM eval harness in `evals/`. Calls the real OpenAI API, costs tokens, run manually. It exercises the *vendored* rescue prompt, so the eval and the shipped prompt cannot drift. Never wired into `npm test`. See `evals/README.md`.

## AI Rescue Agent — Invariants

These must stay true; breaking one silently degrades the agent.

- **The agent never auto-sends.** Every rescue email is a *draft* posted to Slack for a human to review and send. No node may send email directly. This is the backstop for every other AI failure mode — keep it.
- **The LLM has exactly one job:** turn structured failure data into one rescue email. Everything before it (Switch on `errorCode`, fix-hint lookup) and after it (schema check, Slack post, re-check activation) is deterministic.
- **`ErrorCode` string values are a frozen cross-system contract.** The n8n Switch node branches on them — append-only, never rename or remove. Enforced by `tests/contract/error-code-taxonomy.test.ts`.
- **The canonical rescue prompt lives in `src/lib/rescue-prompt.ts`.** The repo is the source of truth; the n8n workflow is reconciled from it (`N8N-CHECKLIST.md`). Editing the prompt only in n8n's UI would drift it from the evals.

## Data Models

- **User**: Standard auth user with briefs and events
- **Brief**: Webhook payload stored with status, input JSON, summary text, and action items
- **Event**: Analytics/tracking events with JSON properties

## Environment Variables

Required in `.env`:
- `DATABASE_URL` - SQLite database path
- `AUTH_SECRET` - NextAuth secret
- `AUTH_URL` - Base URL of the app (e.g., `http://localhost:3000`)
- `INTERNAL_API_TOKEN` - Secret token for `/api/activation-debug` endpoint
- `OPENAI_API_KEY` - (optional) OpenAI key. The ingest path uses it to generate each brief's summary + action items; without it, ingest falls back to a deterministic offline summary. Also needed for `npm run eval`. (The n8n rescue agent uses its own credential, not this one.)

## Standing Instructions

### Maintain FORPIERRE.md

Write a detailed `FORPIERRE.md` file that explains the whole project in plain language.

Include:
- The technical architecture
- The structure of the codebase and how the various parts are connected
- The technologies used and why we made these technical decisions
- Lessons learned: bugs we ran into and how we fixed them, potential pitfalls and how to avoid them, new technologies used, how good engineers think and work, best practices
- Last updated time stamp with date and time on the CET timezone

Style guidelines:
- Make it engaging to read, not boring technical documentation
- Use analogies and anecdotes to make concepts understandable and memorable
- Keep updating this file as the project evolves

### Dependency upgrades

When running `npm audit fix --force`, always read the *proposed version number* before executing. The tool will happily propose major-version downgrades to silence transitive vulnerabilities — at one point it wanted to drop Next.js from 16.2.6 to 9.3.3 to fix a `postcss` warning, which would have destroyed the app. Treat audit warnings as signals to triage, not as instructions to apply blindly. For transitive CVEs that don't apply to this app's actual usage, either leave them standing or pin a fix via the `overrides` field in `package.json`.
