import { NextRequest } from "next/server";
import { redactString, redactValue } from "./redact";

const HEADER_WHITELIST = [
  "content-type",
  "user-agent",
  "x-flowbrief-signature",
  "x-forwarded-for",
];

/**
 * Truncate a string to a maximum length
 */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen);
}

/**
 * Pick only whitelisted headers, normalized to lowercase keys
 */
export function pickHeaders(
  headers: Headers
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of HEADER_WHITELIST) {
    const value = headers.get(key);
    if (value !== null) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Safely read the request body once. Returns the raw string.
 * Returns null if reading fails.
 */
export async function safeReadBody(
  request: NextRequest
): Promise<string | null> {
  try {
    return await request.text();
  } catch {
    return null;
  }
}

/**
 * Extract metadata from a request for logging
 */
export function extractRequestMeta(
  request: NextRequest,
  rawBody: string | null
): {
  httpMethod: string;
  path: string;
  contentType: string;
  bodySize: number;
  keysCount?: number;
  keys?: string[];
} {
  const meta: {
    httpMethod: string;
    path: string;
    contentType: string;
    bodySize: number;
    keysCount?: number;
    keys?: string[];
  } = {
    httpMethod: request.method,
    path: request.nextUrl.pathname,
    contentType: request.headers.get("content-type") || "",
    bodySize: rawBody?.length ?? 0,
  };

  // Try to parse JSON and extract top-level keys
  if (rawBody) {
    try {
      const parsed = JSON.parse(rawBody);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const topLevelKeys = Object.keys(parsed);
        meta.keysCount = topLevelKeys.length;
        meta.keys = topLevelKeys;
      }
    } catch {
      // Not valid JSON, skip keys extraction
    }
  }

  return meta;
}

/**
 * Build properties for webhook_failed event.
 *
 * This is the PII/secret redaction chokepoint. A webhook_failed event fans
 * out to the DB, the /api/activation-debug endpoint, the n8n rescue agent,
 * the GPT-4o prompt, and the Slack draft — redacting here scrubs every one
 * of those at once. rawBody is truncated first (to bound the work) then
 * redacted; errorDetails and headers are redacted recursively. errorCode,
 * httpMethod, path, and contentType are left as-is: low-risk machine-set
 * values, and redacting contentType would corrupt the errorDetails.received
 * comparison the agent shows the user.
 */
export function buildFailureProperties(
  request: NextRequest,
  rawBody: string | null,
  errorCode: string,
  errorDetails: Record<string, unknown>
): Record<string, unknown> {
  const MAX_RAW_BODY_LENGTH = 20 * 1024; // 20KB

  return {
    errorCode,
    errorDetails: redactValue(errorDetails) as Record<string, unknown>,
    httpMethod: request.method,
    path: request.nextUrl.pathname,
    contentType: request.headers.get("content-type") || "",
    rawBody: rawBody
      ? redactString(truncate(rawBody, MAX_RAW_BODY_LENGTH))
      : null,
    headers: redactValue(pickHeaders(request.headers)) as Record<
      string,
      string
    >,
  };
}
