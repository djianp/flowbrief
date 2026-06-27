// Vitest `setupFiles`: runs before each test file's module graph is
// evaluated. The test environment is set here in code — not in a gitignored
// .env.test file — so `npm test` is zero-config on a fresh clone, and so
// process.env.DATABASE_URL points at the throwaway test database *before*
// any test imports @/lib/prisma (which builds its PrismaClient singleton
// from process.env at import time). These are fixed test values, not secrets.
process.env.DATABASE_URL = "file:./test.db";
process.env.INTERNAL_API_TOKEN = "test-internal-token-deadbeef";

// The ingest route now calls generateBrief(), which hits OpenAI when
// OPENAI_API_KEY is set. Tests must stay hermetic/offline, so force the
// deterministic fallback path by clearing the key even if a developer has it
// exported in their shell (Vitest does not load .env.local). Unit tests that
// exercise the OpenAI branch set it explicitly and stub fetch.
delete process.env.OPENAI_API_KEY;
