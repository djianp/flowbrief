import { config } from "dotenv";

// Vitest `setupFiles`: runs before each test file's module graph is
// evaluated. Loading .env.test here guarantees process.env.DATABASE_URL
// points at the throwaway test database *before* any test imports
// @/lib/prisma, which builds its PrismaClient singleton from process.env
// at import time. INTERNAL_API_TOKEN is loaded here too, for the
// activation-debug auth tests.
config({ path: ".env.test", override: true, quiet: true });
