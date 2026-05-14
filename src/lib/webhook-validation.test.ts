import { describe, it, expect } from "vitest";
import {
  validateWebhookPayload,
  type ValidationResult,
  type WebhookPayload,
} from "./webhook-validation";
import { ErrorCode, type WebhookErrorResponse } from "./webhook-errors";

// validateWebhookPayload returns a discriminated union. These helpers
// assert-and-narrow in one step so each test can focus on the fields it
// actually cares about instead of repeating the narrowing boilerplate.
function expectInvalid(result: ValidationResult): WebhookErrorResponse {
  expect(result.valid).toBe(false);
  if (result.valid) throw new Error("expected an invalid result");
  return result.error;
}

function expectValid(result: ValidationResult): WebhookPayload {
  expect(result.valid).toBe(true);
  if (!result.valid) throw new Error("expected a valid result");
  return result.payload;
}

describe("validateWebhookPayload", () => {
  describe("valid payloads", () => {
    it("accepts a minimal payload with just title and content", () => {
      const payload = expectValid(
        validateWebhookPayload({ title: "Order received", content: "Details" }),
      );
      expect(payload.title).toBe("Order received");
      expect(payload.content).toBe("Details");
      expect(payload.source).toBeUndefined();
      expect(payload.timestamp).toBeUndefined();
    });

    it("accepts a full payload with source and a canonical ISO timestamp", () => {
      const ts = "2026-05-14T12:00:00.000Z";
      const payload = expectValid(
        validateWebhookPayload({
          title: "T",
          content: "C",
          source: "stripe",
          timestamp: ts,
        }),
      );
      expect(payload.source).toBe("stripe");
      expect(payload.timestamp).toBe(ts);
    });

    it("ignores unknown extra keys (they are not copied into the payload)", () => {
      const payload = expectValid(
        validateWebhookPayload({ title: "T", content: "C", extra: "ignored" }),
      );
      expect(payload).not.toHaveProperty("extra");
    });
  });

  describe("non-object input", () => {
    it("rejects null as INVALID_FIELD_TYPE", () => {
      const error = expectInvalid(validateWebhookPayload(null));
      expect(error.errorCode).toBe(ErrorCode.INVALID_FIELD_TYPE);
      expect(error.errorDetails.received).toBe("null");
    });

    it("rejects a string as INVALID_FIELD_TYPE", () => {
      const error = expectInvalid(validateWebhookPayload("a string"));
      expect(error.errorCode).toBe(ErrorCode.INVALID_FIELD_TYPE);
      expect(error.errorDetails.received).toBe("string");
    });

    it("rejects a number as INVALID_FIELD_TYPE", () => {
      const error = expectInvalid(validateWebhookPayload(42));
      expect(error.errorCode).toBe(ErrorCode.INVALID_FIELD_TYPE);
      expect(error.errorDetails.received).toBe("number");
    });

    it("treats an array as a missing-field object, not INVALID_FIELD_TYPE", () => {
      // Quirk worth pinning: `typeof [] === "object"` and `[] !== null`, so an
      // array slips past the object guard and fails on the required `title`
      // field instead. This test documents the *current* behavior so any
      // future change to it is deliberate.
      const error = expectInvalid(validateWebhookPayload([]));
      expect(error.errorCode).toBe(ErrorCode.MISSING_REQUIRED_FIELD);
      expect(error.errorDetails.field).toBe("title");
    });
  });

  describe("missing required fields", () => {
    it("rejects a payload missing title", () => {
      const error = expectInvalid(validateWebhookPayload({ content: "C" }));
      expect(error.errorCode).toBe(ErrorCode.MISSING_REQUIRED_FIELD);
      expect(error.errorDetails.field).toBe("title");
    });

    it("rejects a payload missing content", () => {
      const error = expectInvalid(validateWebhookPayload({ title: "T" }));
      expect(error.errorCode).toBe(ErrorCode.MISSING_REQUIRED_FIELD);
      expect(error.errorDetails.field).toBe("content");
    });

    it("reports title first for a completely empty object", () => {
      const error = expectInvalid(validateWebhookPayload({}));
      expect(error.errorCode).toBe(ErrorCode.MISSING_REQUIRED_FIELD);
      expect(error.errorDetails.field).toBe("title");
    });
  });

  describe("wrong field types", () => {
    it("rejects a non-string title", () => {
      const error = expectInvalid(
        validateWebhookPayload({ title: 1, content: "C" }),
      );
      expect(error.errorCode).toBe(ErrorCode.INVALID_FIELD_TYPE);
      expect(error.errorDetails.field).toBe("title");
      expect(error.errorDetails.expected).toBe("string");
      expect(error.errorDetails.received).toBe("number");
    });

    it("rejects a non-string content", () => {
      const error = expectInvalid(
        validateWebhookPayload({ title: "T", content: true }),
      );
      expect(error.errorCode).toBe(ErrorCode.INVALID_FIELD_TYPE);
      expect(error.errorDetails.field).toBe("content");
      expect(error.errorDetails.received).toBe("boolean");
    });

    it("rejects a non-string source", () => {
      const error = expectInvalid(
        validateWebhookPayload({ title: "T", content: "C", source: 5 }),
      );
      expect(error.errorCode).toBe(ErrorCode.INVALID_FIELD_TYPE);
      expect(error.errorDetails.field).toBe("source");
    });

    it("rejects a non-string timestamp before the ISO-format check runs", () => {
      const error = expectInvalid(
        validateWebhookPayload({ title: "T", content: "C", timestamp: 123 }),
      );
      expect(error.errorCode).toBe(ErrorCode.INVALID_FIELD_TYPE);
      expect(error.errorDetails.field).toBe("timestamp");
      expect(error.errorDetails.received).toBe("number");
    });
  });

  describe("timestamp ISO 8601 validation", () => {
    it("accepts a canonical ISO string that round-trips through Date", () => {
      const payload = expectValid(
        validateWebhookPayload({
          title: "T",
          content: "C",
          timestamp: new Date().toISOString(),
        }),
      );
      expect(payload.timestamp).toBeDefined();
    });

    it("rejects a date-only string (does not round-trip)", () => {
      const error = expectInvalid(
        validateWebhookPayload({
          title: "T",
          content: "C",
          timestamp: "2026-01-01",
        }),
      );
      expect(error.errorCode).toBe(ErrorCode.INVALID_FIELD_TYPE);
      expect(error.errorDetails.field).toBe("timestamp");
    });

    it("rejects an ISO string without milliseconds (does not round-trip)", () => {
      const error = expectInvalid(
        validateWebhookPayload({
          title: "T",
          content: "C",
          timestamp: "2026-05-14T12:00:00Z",
        }),
      );
      expect(error.errorCode).toBe(ErrorCode.INVALID_FIELD_TYPE);
      expect(error.errorDetails.field).toBe("timestamp");
    });

    it("rejects an unparseable timestamp", () => {
      const error = expectInvalid(
        validateWebhookPayload({
          title: "T",
          content: "C",
          timestamp: "not-a-date",
        }),
      );
      expect(error.errorCode).toBe(ErrorCode.INVALID_FIELD_TYPE);
      expect(error.errorDetails.field).toBe("timestamp");
    });
  });
});
