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
│   ├── request-utils.ts     # Safe body reading + logging metadata
│   ├── events.ts            # Event tracking utilities
│   └── ai.ts                # AI/LLM integration (unused in ingest path)
└── prisma/
    └── schema.prisma        # Database schema
```

## Key Commands

```bash
npm run dev        # Start development server
npm run build      # Build for production
npm run db:push    # Push Prisma schema to database
npm run db:studio  # Open Prisma Studio
```

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
- `OPENAI_API_KEY` - (optional) OpenAI key for AI features

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
