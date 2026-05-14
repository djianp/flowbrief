import { ErrorCode } from "../../src/lib/webhook-errors";
import type { RescuePromptInput } from "../../src/lib/rescue-prompt";

/** One golden-set input: a realistic failure the rescue agent must handle. */
export interface GoldenFixture {
  id: string;
  /** What this fixture exercises — shown on the scorecard. */
  note: string;
  input: RescuePromptInput;
}

// errorDetails / rawBody shapes mirror what src/app/api/ingest/[userId] and
// buildFailureProperties actually produce, so the eval exercises real inputs.
export const GOLDEN_FIXTURES: GoldenFixture[] = [
  {
    id: "golden:invalid-json",
    note: "Body sent as a raw JS object — never JSON.stringify'd.",
    input: {
      userId: "user-aaa111",
      email: "dev@acme.example",
      plan: "pro",
      errorCode: ErrorCode.INVALID_JSON,
      errorDetails: { message: "Request body is not valid JSON" },
      rawBody: "[object Object]",
    },
  },
  {
    id: "golden:unsupported-content-type",
    note: "Client defaulted to text/plain instead of application/json.",
    input: {
      userId: "user-bbb222",
      email: "ops@beta.example",
      plan: "pro",
      errorCode: ErrorCode.UNSUPPORTED_CONTENT_TYPE,
      errorDetails: { expected: "application/json", received: "text/plain" },
      rawBody: '{"title":"Order","content":"A new order arrived"}',
    },
  },
  {
    id: "golden:missing-title",
    note: "Valid JSON, but the required `title` field is absent.",
    input: {
      userId: "user-ccc333",
      email: "founder@gamma.example",
      plan: "starter",
      errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
      errorDetails: {
        field: "title",
        message: "Required field 'title' is missing",
      },
      rawBody: '{"content":"Customer signed up"}',
    },
  },
  {
    id: "golden:missing-content",
    note: "Valid JSON, but the required `content` field is absent.",
    input: {
      userId: "user-ddd444",
      email: "team@delta.example",
      plan: "pro",
      errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
      errorDetails: {
        field: "content",
        message: "Required field 'content' is missing",
      },
      rawBody: '{"title":"Weekly digest"}',
    },
  },
  {
    id: "golden:invalid-field-type-title",
    note: "`title` sent as a number instead of a string.",
    input: {
      userId: "user-eee555",
      email: "hi@epsilon.example",
      plan: "pro",
      errorCode: ErrorCode.INVALID_FIELD_TYPE,
      errorDetails: { field: "title", expected: "string", received: "number" },
      rawBody: '{"title":42,"content":"Numeric title by mistake"}',
    },
  },
  {
    id: "golden:invalid-field-type-timestamp",
    note: "`timestamp` is a date-only string, not canonical ISO 8601.",
    input: {
      userId: "user-fff666",
      email: "data@zeta.example",
      plan: "pro",
      errorCode: ErrorCode.INVALID_FIELD_TYPE,
      errorDetails: {
        field: "timestamp",
        expected: "ISO 8601 string",
        received: "2026-01-01",
        message: "timestamp must be a valid ISO 8601 string",
      },
      rawBody:
        '{"title":"Event","content":"Happened","timestamp":"2026-01-01"}',
    },
  },
  {
    id: "golden:payload-too-large",
    note: "Payload exceeded the 20KB limit.",
    input: {
      userId: "user-ggg777",
      email: "bulk@eta.example",
      plan: "pro",
      errorCode: ErrorCode.PAYLOAD_TOO_LARGE,
      errorDetails: { maxBytes: 20480, receivedBytes: 48211 },
      rawBody:
        '{"title":"Huge export","content":"... (very large body, truncated) ..."}',
    },
  },
  {
    id: "golden:invalid-method",
    note: "Webhook called with GET instead of POST.",
    input: {
      userId: "user-hhh888",
      email: "automation@theta.example",
      plan: "starter",
      errorCode: ErrorCode.INVALID_METHOD,
      errorDetails: { allowed: ["POST"], received: "GET" },
      rawBody: null,
    },
  },
  {
    id: "golden:user-not-found",
    note: "Webhook URL contains a userId that does not exist.",
    input: {
      userId: "user-does-not-exist",
      email: "newuser@iota.example",
      plan: "pro",
      errorCode: ErrorCode.USER_NOT_FOUND,
      errorDetails: { userId: "user-does-not-exist" },
      rawBody: '{"title":"First webhook","content":"Trying it out"}',
    },
  },
  {
    id: "golden:unauthorized",
    note: "Request failed the webhook authentication check.",
    input: {
      userId: "user-jjj999",
      email: "secure@kappa.example",
      plan: "pro",
      errorCode: ErrorCode.UNAUTHORIZED,
      errorDetails: { message: "Webhook signature did not match" },
      rawBody: '{"title":"Signed payload","content":"..."}',
    },
  },
];
