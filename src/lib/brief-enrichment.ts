import { after } from "next/server";
import { generateBrief } from "./ai";
import { updateBriefContent } from "./briefs";

/**
 * Enrich an already-persisted brief with an AI-generated summary + action items.
 *
 * This runs as a background task (see `scheduleBriefEnrichment`), AFTER the
 * ingest webhook has already returned 200 and created the SUCCESS brief. That
 * ordering is the whole point of moving generation off the request path:
 *
 *   - The activation invariant — "a valid webhook ⇒ a SUCCESS brief exists" —
 *     is satisfied synchronously, before this ever runs. Nothing the rescue
 *     agent depends on waits for OpenAI.
 *   - The slow/flaky OpenAI call no longer adds latency to the webhook.
 *
 * Total by construction: it must NEVER reject. The brief already exists with a
 * placeholder summary, so if generation or the DB write fails we just log and
 * leave the placeholder in place — the user stays activated either way. (A
 * rejecting background task would also surface as an unhandled rejection.)
 */
export async function enrichBrief(
  briefId: string,
  inputJson: unknown
): Promise<void> {
  try {
    const { summaryText, actionItemsJson } = await generateBrief(inputJson);
    await updateBriefContent(briefId, { summaryText, actionItemsJson });
  } catch (err) {
    console.error(`enrichBrief: failed for brief ${briefId} —`, err);
  }
}

/**
 * Schedule brief enrichment to run after the HTTP response has been sent.
 *
 * Uses Next's `after()` so the work runs once the response is flushed and works
 * both in a long-running Node server (the callback runs on the same event loop)
 * and on serverless (the platform keeps the function alive via waitUntil).
 * Returns immediately — the webhook never waits for OpenAI.
 */
export function scheduleBriefEnrichment(
  briefId: string,
  inputJson: unknown
): void {
  after(() => enrichBrief(briefId, inputJson));
}
