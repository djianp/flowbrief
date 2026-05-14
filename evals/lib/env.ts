import { config } from "dotenv";

// Load environment for the eval harness. run.ts imports this FIRST, before
// any other module, so OPENAI_API_KEY is populated before anything reads it.
// .env.local wins over .env (loaded second, but dotenv does not override an
// already-set var — so put eval-specific overrides in .env.local).
config({ path: ".env", quiet: true });
config({ path: ".env.local", quiet: true });
