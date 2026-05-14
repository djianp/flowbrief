/**
 * The structured error vocabulary for the webhook ingest endpoint.
 *
 * ⚠️ PUBLISHED CROSS-SYSTEM CONTRACT — these string values are not internal.
 * They are consumed by:
 *   1. The n8n "Activation SLA + AI Rescue Loop" workflow (CJY7NTNz0UCzYxG4):
 *      its Switch node branches on these exact strings.
 *   2. `src/lib/rescue-prompt.ts` — `FIX_HINTS` is keyed by these values.
 *
 * Rules:
 *   - Values are APPEND-ONLY. Never rename or remove a member: a rename makes
 *     the n8n Switch node fall through to DEFAULT silently — no error, just
 *     quietly worse rescue emails.
 *   - Adding a member requires updating, in the same change: `FIX_HINTS` in
 *     `rescue-prompt.ts`, the n8n Switch node (see `N8N-CHECKLIST.md`), and
 *     the lock test.
 *
 * Enforced by `tests/contract/error-code-taxonomy.test.ts`.
 */
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

export interface WebhookErrorResponse {
  ok: false;
  errorCode: ErrorCode;
  errorDetails: Record<string, unknown>;
}

export interface WebhookSuccessResponse {
  ok: true;
}

export type WebhookResponse = WebhookErrorResponse | WebhookSuccessResponse;

export function createErrorResponse(
  errorCode: ErrorCode,
  errorDetails: Record<string, unknown> = {}
): WebhookErrorResponse {
  return {
    ok: false,
    errorCode,
    errorDetails,
  };
}

export function createSuccessResponse(): WebhookSuccessResponse {
  return { ok: true };
}
