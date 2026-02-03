import { NextRequest } from "next/server";

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
 * Build properties for webhook_failed event
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
    errorDetails,
    httpMethod: request.method,
    path: request.nextUrl.pathname,
    contentType: request.headers.get("content-type") || "",
    rawBody: rawBody ? truncate(rawBody, MAX_RAW_BODY_LENGTH) : null,
    headers: pickHeaders(request.headers),
  };
}
