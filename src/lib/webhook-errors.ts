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
