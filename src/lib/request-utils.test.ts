import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import {
  truncate,
  pickHeaders,
  extractRequestMeta,
  buildFailureProperties,
} from "./request-utils";

function makeRequest(
  url: string,
  init?: { method?: string; headers?: Record<string, string> },
): NextRequest {
  return new NextRequest(url, {
    method: init?.method ?? "POST",
    headers: init?.headers ?? {},
  });
}

describe("truncate", () => {
  it("returns the string unchanged when shorter than the limit", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("returns the string unchanged when exactly at the limit", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("slices the string when longer than the limit", () => {
    expect(truncate("hello world", 5)).toBe("hello");
  });

  it("handles the empty string", () => {
    expect(truncate("", 5)).toBe("");
  });
});

describe("pickHeaders", () => {
  it("keeps only whitelisted headers and drops everything else", () => {
    const headers = new Headers({
      "content-type": "application/json",
      "user-agent": "n8n-webhook",
      "x-forwarded-for": "203.0.113.4",
      authorization: "Bearer super-secret",
      "x-custom-thing": "should not survive",
    });
    expect(pickHeaders(headers)).toEqual({
      "content-type": "application/json",
      "user-agent": "n8n-webhook",
      "x-forwarded-for": "203.0.113.4",
    });
  });

  it("omits whitelisted headers that are absent rather than emitting null", () => {
    const result = pickHeaders(
      new Headers({ "content-type": "application/json" }),
    );
    expect(result).toEqual({ "content-type": "application/json" });
    expect("x-flowbrief-signature" in result).toBe(false);
  });
});

describe("extractRequestMeta", () => {
  it("extracts top-level keys from a JSON object body", () => {
    const body = '{"title":"T","content":"C"}';
    const meta = extractRequestMeta(
      makeRequest("http://localhost/api/ingest/user-1", {
        headers: { "content-type": "application/json" },
      }),
      body,
    );
    expect(meta.httpMethod).toBe("POST");
    expect(meta.path).toBe("/api/ingest/user-1");
    expect(meta.contentType).toBe("application/json");
    expect(meta.bodySize).toBe(body.length);
    expect(meta.keysCount).toBe(2);
    expect(meta.keys).toEqual(["title", "content"]);
  });

  it("omits keys for a non-JSON body", () => {
    const body = "this is not json";
    const meta = extractRequestMeta(
      makeRequest("http://localhost/api/ingest/user-1"),
      body,
    );
    expect(meta.bodySize).toBe(body.length);
    expect(meta.keysCount).toBeUndefined();
    expect(meta.keys).toBeUndefined();
  });

  it("omits keys for a JSON array body (only objects expose keys)", () => {
    const meta = extractRequestMeta(
      makeRequest("http://localhost/api/ingest/user-1"),
      '["a","b"]',
    );
    expect(meta.keysCount).toBeUndefined();
    expect(meta.keys).toBeUndefined();
  });

  it("reports a body size of 0 for a null body", () => {
    const meta = extractRequestMeta(
      makeRequest("http://localhost/api/ingest/user-1"),
      null,
    );
    expect(meta.bodySize).toBe(0);
    expect(meta.keys).toBeUndefined();
  });
});

describe("buildFailureProperties", () => {
  it("captures error context, the raw body, and whitelisted headers", () => {
    const rawBody = '{"title":"T","content":"C"}';
    const props = buildFailureProperties(
      makeRequest("http://localhost/api/ingest/user-1", {
        headers: {
          "content-type": "application/json",
          authorization: "Bearer x",
        },
      }),
      rawBody,
      "INVALID_JSON",
      { message: "Request body is not valid JSON" },
    );
    expect(props.errorCode).toBe("INVALID_JSON");
    expect(props.errorDetails).toEqual({
      message: "Request body is not valid JSON",
    });
    expect(props.httpMethod).toBe("POST");
    expect(props.path).toBe("/api/ingest/user-1");
    // A benign body round-trips unchanged — redaction must not be over-eager.
    expect(props.rawBody).toBe(rawBody);
    // The non-whitelisted Authorization header must not survive into the log.
    expect(props.headers).toEqual({ "content-type": "application/json" });
  });

  it("truncates a raw body that exceeds the 20KB cap", () => {
    const huge = "x".repeat(25 * 1024);
    const props = buildFailureProperties(
      makeRequest("http://localhost/api/ingest/user-1"),
      huge,
      "PAYLOAD_TOO_LARGE",
      {},
    );
    expect((props.rawBody as string).length).toBe(20 * 1024);
  });

  it("stores a null raw body as null", () => {
    const props = buildFailureProperties(
      makeRequest("http://localhost/api/ingest/user-1"),
      null,
      "INVALID_JSON",
      {},
    );
    expect(props.rawBody).toBeNull();
  });

  it("redacts secrets in the raw body", () => {
    const rawBody =
      '{"email":"jane@example.com","key":"sk-ABCDEFGHIJ0123456789"}';
    const props = buildFailureProperties(
      makeRequest("http://localhost/api/ingest/user-1"),
      rawBody,
      "INVALID_FIELD_TYPE",
      {},
    );
    const stored = props.rawBody as string;
    expect(stored).toContain("[REDACTED_EMAIL]");
    expect(stored).toContain("[REDACTED_API_KEY]");
    expect(stored).not.toContain("jane@example.com");
    expect(stored).not.toContain("sk-ABCDEFGHIJ");
  });

  it("redacts secrets nested in errorDetails", () => {
    const props = buildFailureProperties(
      makeRequest("http://localhost/api/ingest/user-1"),
      null,
      "INVALID_FIELD_TYPE",
      { field: "content", received: "contact me at ops@acme.io" },
    );
    const details = props.errorDetails as Record<string, unknown>;
    expect(details.field).toBe("content");
    expect(details.received).toBe("contact me at [REDACTED_EMAIL]");
  });
});
