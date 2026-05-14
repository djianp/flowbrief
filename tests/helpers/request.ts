import { NextRequest } from "next/server";

/**
 * Build a NextRequest plus the route-context object the dynamic ingest
 * handler expects ({ params: Promise<{ userId }> }). content-type defaults
 * to application/json; pass `headers` to override or extend it.
 */
export function makeIngestRequest(opts: {
  userId: string;
  method?: string;
  body?: string;
  headers?: Record<string, string>;
}): {
  request: NextRequest;
  context: { params: Promise<{ userId: string }> };
} {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...opts.headers,
  };
  const request = new NextRequest(
    `http://localhost/api/ingest/${opts.userId}`,
    {
      method: opts.method ?? "POST",
      headers,
      ...(opts.body !== undefined ? { body: opts.body } : {}),
    },
  );
  return {
    request,
    context: { params: Promise.resolve({ userId: opts.userId }) },
  };
}

/**
 * Build a GET NextRequest for /api/activation-debug. Pass `token: null` to
 * omit the x-internal-token header entirely; pass `userId: undefined` to
 * omit the query param.
 */
export function makeDebugRequest(opts: {
  userId?: string;
  token?: string | null;
}): NextRequest {
  const url = new URL("http://localhost/api/activation-debug");
  if (opts.userId !== undefined) {
    url.searchParams.set("userId", opts.userId);
  }
  const headers = new Headers();
  if (opts.token !== null && opts.token !== undefined) {
    headers.set("x-internal-token", opts.token);
  }
  return new NextRequest(url, { method: "GET", headers });
}
