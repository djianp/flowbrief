import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  POST,
  GET,
  PUT,
  DELETE,
  PATCH,
} from "@/app/api/ingest/[userId]/route";
import { ErrorCode } from "@/lib/webhook-errors";
import { prisma } from "@/lib/prisma";
import { resetDb, seedUser } from "../helpers/db";
import { makeIngestRequest } from "../helpers/request";

const USER_ID = "test-user-1";

beforeEach(async () => {
  await resetDb();
  await seedUser({ id: USER_ID });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/ingest/[userId] — validation pipeline", () => {
  it("rejects an unknown userId with 404 USER_NOT_FOUND", async () => {
    const { request, context } = makeIngestRequest({
      userId: "ghost-user",
      body: JSON.stringify({ title: "T", content: "C" }),
    });
    const response = await POST(request, context);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.errorCode).toBe(ErrorCode.USER_NOT_FOUND);
  });

  it("rejects a non-JSON content-type with 415 UNSUPPORTED_CONTENT_TYPE", async () => {
    const { request, context } = makeIngestRequest({
      userId: USER_ID,
      headers: { "content-type": "text/plain" },
      body: "hello",
    });
    const response = await POST(request, context);
    expect(response.status).toBe(415);
    const body = await response.json();
    expect(body.errorCode).toBe(ErrorCode.UNSUPPORTED_CONTENT_TYPE);
  });

  it("rejects an oversized payload with 413 PAYLOAD_TOO_LARGE", async () => {
    // The route checks size twice — content-length header, then actual body
    // length — as defense in depth. A >20KB body trips the limit either way.
    const { request, context } = makeIngestRequest({
      userId: USER_ID,
      body: "x".repeat(21 * 1024),
    });
    const response = await POST(request, context);
    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body.errorCode).toBe(ErrorCode.PAYLOAD_TOO_LARGE);
  });

  it("rejects an unparseable body with 400 INVALID_JSON", async () => {
    const { request, context } = makeIngestRequest({
      userId: USER_ID,
      body: "{not json",
    });
    const response = await POST(request, context);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.errorCode).toBe(ErrorCode.INVALID_JSON);
  });

  it("rejects a payload missing a required field with 422 MISSING_REQUIRED_FIELD", async () => {
    const { request, context } = makeIngestRequest({
      userId: USER_ID,
      body: JSON.stringify({ content: "no title here" }),
    });
    const response = await POST(request, context);
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.errorCode).toBe(ErrorCode.MISSING_REQUIRED_FIELD);
  });

  it("rejects a wrong-typed field with 422 INVALID_FIELD_TYPE", async () => {
    const { request, context } = makeIngestRequest({
      userId: USER_ID,
      body: JSON.stringify({ title: 1, content: "C" }),
    });
    const response = await POST(request, context);
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.errorCode).toBe(ErrorCode.INVALID_FIELD_TYPE);
  });

  it("rejects a malformed timestamp with 422 INVALID_FIELD_TYPE", async () => {
    const { request, context } = makeIngestRequest({
      userId: USER_ID,
      body: JSON.stringify({ title: "T", content: "C", timestamp: "nope" }),
    });
    const response = await POST(request, context);
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.errorCode).toBe(ErrorCode.INVALID_FIELD_TYPE);
  });

  it("accepts a valid payload: 200, a SUCCESS Brief, and a webhook_received event", async () => {
    const { request, context } = makeIngestRequest({
      userId: USER_ID,
      body: JSON.stringify({ title: "Order #1", content: "A new order" }),
    });
    const response = await POST(request, context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    const briefs = await prisma.brief.findMany({ where: { userId: USER_ID } });
    expect(briefs).toHaveLength(1);
    expect(briefs[0].status).toBe("SUCCESS");
    expect(briefs[0].summaryText).toBe("Order #1");

    const received = await prisma.event.findMany({
      where: { userId: USER_ID, eventName: "webhook_received" },
    });
    expect(received).toHaveLength(1);
  });
});

describe("POST /api/ingest/[userId] — failure logging", () => {
  // The webhook_failed event is the record the n8n rescue agent reads via
  // /api/activation-debug, so its errorCode must match the HTTP response.
  it("logs webhook_failed with errorCode INVALID_JSON", async () => {
    const { request, context } = makeIngestRequest({
      userId: USER_ID,
      body: "{not json",
    });
    await POST(request, context);
    const failed = await prisma.event.findMany({
      where: { userId: USER_ID, eventName: "webhook_failed" },
    });
    expect(failed).toHaveLength(1);
    const props = JSON.parse(failed[0].propertiesJson);
    expect(props.errorCode).toBe(ErrorCode.INVALID_JSON);
  });

  it("logs webhook_failed with errorCode MISSING_REQUIRED_FIELD", async () => {
    const { request, context } = makeIngestRequest({
      userId: USER_ID,
      body: JSON.stringify({ content: "no title" }),
    });
    await POST(request, context);
    const failed = await prisma.event.findMany({
      where: { userId: USER_ID, eventName: "webhook_failed" },
    });
    expect(failed).toHaveLength(1);
    const props = JSON.parse(failed[0].propertiesJson);
    expect(props.errorCode).toBe(ErrorCode.MISSING_REQUIRED_FIELD);
  });

  it("logs webhook_failed with errorCode UNSUPPORTED_CONTENT_TYPE", async () => {
    const { request, context } = makeIngestRequest({
      userId: USER_ID,
      headers: { "content-type": "text/plain" },
      body: "hello",
    });
    await POST(request, context);
    const failed = await prisma.event.findMany({
      where: { userId: USER_ID, eventName: "webhook_failed" },
    });
    expect(failed).toHaveLength(1);
    const props = JSON.parse(failed[0].propertiesJson);
    expect(props.errorCode).toBe(ErrorCode.UNSUPPORTED_CONTENT_TYPE);
  });

  it("redacts secrets from the webhook_failed event's rawBody (end-to-end)", async () => {
    // A payload that fails validation (no title) AND carries secrets. The
    // route logs webhook_failed via buildFailureProperties — the redaction
    // chokepoint — so the persisted row must already be scrubbed.
    const { request, context } = makeIngestRequest({
      userId: USER_ID,
      body: JSON.stringify({
        content: "ping ops@acme.io",
        token: "sk-ABCDEFGHIJ0123456789",
      }),
    });
    await POST(request, context);
    const failed = await prisma.event.findMany({
      where: { userId: USER_ID, eventName: "webhook_failed" },
    });
    expect(failed).toHaveLength(1);
    const props = JSON.parse(failed[0].propertiesJson);
    expect(props.rawBody).toContain("[REDACTED_EMAIL]");
    expect(props.rawBody).toContain("[REDACTED_API_KEY]");
    expect(props.rawBody).not.toContain("ops@acme.io");
    expect(props.rawBody).not.toContain("sk-ABCDEFGHIJ");
  });
});

describe("non-POST methods on /api/ingest/[userId]", () => {
  it.each([
    ["GET", GET],
    ["PUT", PUT],
    ["DELETE", DELETE],
    ["PATCH", PATCH],
  ] as const)("rejects %s with 405 INVALID_METHOD", async (_method, handler) => {
    const { request, context } = makeIngestRequest({
      userId: USER_ID,
      method: _method,
    });
    const response = await handler(request, context);
    expect(response.status).toBe(405);
    const body = await response.json();
    expect(body.errorCode).toBe(ErrorCode.INVALID_METHOD);
  });
});
