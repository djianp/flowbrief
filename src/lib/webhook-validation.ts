import { ErrorCode, createErrorResponse, WebhookErrorResponse } from "./webhook-errors";

export interface WebhookPayload {
  title: string;
  content: string;
  source?: string;
  timestamp?: string;
}

interface ValidationSuccess {
  valid: true;
  payload: WebhookPayload;
}

interface ValidationFailure {
  valid: false;
  error: WebhookErrorResponse;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

const REQUIRED_FIELDS = ["title", "content"] as const;

const FIELD_TYPES: Record<string, "string"> = {
  title: "string",
  content: "string",
  source: "string",
  timestamp: "string",
};

function isValidISOTimestamp(value: string): boolean {
  const date = new Date(value);
  return !isNaN(date.getTime()) && value === date.toISOString();
}

export function validateWebhookPayload(data: unknown): ValidationResult {
  if (typeof data !== "object" || data === null) {
    return {
      valid: false,
      error: createErrorResponse(ErrorCode.INVALID_FIELD_TYPE, {
        expected: "object",
        received: data === null ? "null" : typeof data,
      }),
    };
  }

  const payload = data as Record<string, unknown>;

  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    if (!(field in payload)) {
      return {
        valid: false,
        error: createErrorResponse(ErrorCode.MISSING_REQUIRED_FIELD, {
          field,
          message: `Required field '${field}' is missing`,
        }),
      };
    }
  }

  // Check field types
  for (const [field, expectedType] of Object.entries(FIELD_TYPES)) {
    if (field in payload && typeof payload[field] !== expectedType) {
      return {
        valid: false,
        error: createErrorResponse(ErrorCode.INVALID_FIELD_TYPE, {
          field,
          expected: expectedType,
          received: typeof payload[field],
        }),
      };
    }
  }

  // Validate timestamp format if provided
  if (payload.timestamp !== undefined) {
    if (!isValidISOTimestamp(payload.timestamp as string)) {
      return {
        valid: false,
        error: createErrorResponse(ErrorCode.INVALID_FIELD_TYPE, {
          field: "timestamp",
          expected: "ISO 8601 string",
          received: payload.timestamp,
          message: "timestamp must be a valid ISO 8601 string",
        }),
      };
    }
  }

  return {
    valid: true,
    payload: {
      title: payload.title as string,
      content: payload.content as string,
      source: payload.source as string | undefined,
      timestamp: payload.timestamp as string | undefined,
    },
  };
}
