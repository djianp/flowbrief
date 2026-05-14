/**
 * Heuristic PII/secret redaction for failure logs.
 *
 * Applied at the buildFailureProperties chokepoint in request-utils.ts, so a
 * single pass scrubs the webhook_failed event before it reaches the DB, the
 * /api/activation-debug endpoint, the n8n agent, the LLM prompt, and Slack.
 *
 * This is AI-data-hygiene, not DLP: the pattern list is deliberately small
 * and well-understood. It WILL miss novel secret formats, and the broad
 * "long digit run" rule may clip a legitimate long number (e.g. a 13-digit
 * order id). That trade-off is accepted — redaction shrinks blast radius; it
 * does not replace endpoint authentication.
 *
 * Every quantifier is upper-bounded ON PURPOSE. The input here can be ~20KB
 * (a truncated, attacker-controlled rawBody), and an unbounded `+` followed
 * by a required character is a classic catastrophic-backtracking trap — e.g.
 * `[localpart]+@` against 20KB of letters with no `@` is O(n²). Bounding
 * every run (to realistic real-world maximums) keeps redaction linear.
 */

// Ordered: structured secrets (Bearer / JWT / API keys) are matched before
// the broad email and digit-run rules so they win any overlap. Each pass
// replaces with an inert placeholder that no later pass can re-match.
const REDACTIONS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  // "Bearer <token>" — keep the scheme, drop the credential.
  {
    pattern: /Bearer\s+[A-Za-z0-9._~+/=-]{1,4096}/gi,
    replacement: "Bearer [REDACTED_TOKEN]",
  },
  // JSON Web Tokens (header.payload.signature, base64url).
  {
    pattern:
      /eyJ[A-Za-z0-9_-]{1,2048}\.[A-Za-z0-9_-]{1,8192}\.[A-Za-z0-9_-]{1,4096}/g,
    replacement: "[REDACTED_JWT]",
  },
  // OpenAI-style API keys, including sk-proj- variants.
  { pattern: /sk-[A-Za-z0-9_-]{16,512}/g, replacement: "[REDACTED_API_KEY]" },
  // AWS access key IDs.
  { pattern: /(?:AKIA|ASIA)[0-9A-Z]{16}/g, replacement: "[REDACTED_AWS_KEY]" },
  // Email addresses (RFC-ish local-part / domain length bounds).
  {
    pattern: /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,255}\.[A-Za-z]{2,24}/g,
    replacement: "[REDACTED_EMAIL]",
  },
  // Long standalone digit runs (card numbers, long account numbers).
  { pattern: /\b\d{12,40}\b/g, replacement: "[REDACTED_DIGITS]" },
];

/** Redact known secret/PII patterns from a single string. */
export function redactString(input: string): string {
  let result = input;
  for (const { pattern, replacement } of REDACTIONS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Recursively redact every string leaf of a value, leaving non-strings
 * (numbers, booleans, null) and object keys untouched.
 */
export function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      result[key] = redactValue(v);
    }
    return result;
  }
  return value;
}
