import { describe, it, expect } from "vitest";
import {
  ErrorCode,
  createErrorResponse,
  createSuccessResponse,
} from "./webhook-errors";

// The ErrorCode taxonomy *lock* test lives in tests/contract/ (Phase 3) —
// this file only covers the response-builder helpers.

describe("createErrorResponse", () => {
  it("builds a failure response with an empty errorDetails by default", () => {
    expect(createErrorResponse(ErrorCode.INVALID_JSON)).toEqual({
      ok: false,
      errorCode: ErrorCode.INVALID_JSON,
      errorDetails: {},
    });
  });

  it("passes errorDetails through unchanged", () => {
    const details = {
      field: "title",
      message: "Required field 'title' is missing",
    };
    expect(
      createErrorResponse(ErrorCode.MISSING_REQUIRED_FIELD, details),
    ).toEqual({
      ok: false,
      errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
      errorDetails: details,
    });
  });
});

describe("createSuccessResponse", () => {
  it("builds a minimal success response", () => {
    expect(createSuccessResponse()).toEqual({ ok: true });
  });
});
