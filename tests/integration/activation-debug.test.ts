import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { GET } from "@/app/api/activation-debug/route";
import { prisma } from "@/lib/prisma";
import { createBrief } from "@/lib/briefs";
import {
  resetDb,
  seedUser,
  seedFailureEvent,
  seedReceivedEvent,
} from "../helpers/db";
import { makeDebugRequest } from "../helpers/request";

const USER_ID = "test-user-1";
// Loaded from .env.test by the Vitest setupFile — single source of truth so
// the test and the route handler compare the same token.
const TOKEN = process.env.INTERNAL_API_TOKEN as string;

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * Replace ISO-timestamp fields with a placeholder so the shape snapshot
 * freezes the contract's *structure*, not wall-clock values.
 */
function normalizeForSnapshot(body: unknown): unknown {
  const clone = structuredClone(body) as {
    lastAttemptAt?: unknown;
    lastFailure?: { at?: unknown };
    lastReceived?: { at?: unknown };
    recentFailures?: Array<{ at?: unknown }>;
  };
  if (clone.lastAttemptAt) clone.lastAttemptAt = "<ISO>";
  if (clone.lastFailure?.at) clone.lastFailure.at = "<ISO>";
  if (clone.lastReceived?.at) clone.lastReceived.at = "<ISO>";
  if (Array.isArray(clone.recentFailures)) {
    clone.recentFailures = clone.recentFailures.map((f) => ({
      ...f,
      at: "<ISO>",
    }));
  }
  return clone;
}

describe("GET /api/activation-debug — auth", () => {
  it("returns 401 when no internal token is provided", async () => {
    const response = await GET(
      makeDebugRequest({ userId: USER_ID, token: null }),
    );
    expect(response.status).toBe(401);
  });

  it("returns 401 when the internal token is wrong", async () => {
    const response = await GET(
      makeDebugRequest({ userId: USER_ID, token: "wrong-token" }),
    );
    expect(response.status).toBe(401);
  });

  it("returns 400 MISSING_USER_ID when the token is valid but userId is absent", async () => {
    const response = await GET(makeDebugRequest({ token: TOKEN }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("MISSING_USER_ID");
  });
});

describe("GET /api/activation-debug — activation state", () => {
  it("reports activated:false when the user has no SUCCESS brief", async () => {
    await seedUser({ id: USER_ID });
    const response = await GET(
      makeDebugRequest({ userId: USER_ID, token: TOKEN }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.activated).toBe(false);
  });

  it("reports activated:true when the user has a SUCCESS brief", async () => {
    await seedUser({ id: USER_ID });
    await createBrief({
      userId: USER_ID,
      status: "SUCCESS",
      inputJson: { title: "T", content: "C" },
      summaryText: "T",
      actionItemsJson: [],
    });
    const response = await GET(
      makeDebugRequest({ userId: USER_ID, token: TOKEN }),
    );
    const body = await response.json();
    expect(body.activated).toBe(true);
  });
});

describe("GET /api/activation-debug — failure context for the agent", () => {
  // A deterministic failure scenario shared by the value and snapshot tests.
  async function seedFailureScenario(): Promise<void> {
    await seedUser({ id: USER_ID });
    await seedReceivedEvent(USER_ID, {
      httpMethod: "POST",
      path: `/api/ingest/${USER_ID}`,
      contentType: "application/json",
      bodySize: 15,
      keysCount: 1,
      keys: ["content"],
    });
    await seedFailureEvent(USER_ID, {
      errorCode: "MISSING_REQUIRED_FIELD",
      errorDetails: {
        field: "title",
        message: "Required field 'title' is missing",
      },
      httpMethod: "POST",
      path: `/api/ingest/${USER_ID}`,
      contentType: "application/json",
      rawBody: '{"content":"x"}',
      headers: { "content-type": "application/json" },
    });
  }

  it("surfaces the last failure's errorCode, rawBody, and recent failures", async () => {
    await seedFailureScenario();
    const response = await GET(
      makeDebugRequest({ userId: USER_ID, token: TOKEN }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(body.userId).toBe(USER_ID);
    expect(body.lastFailure.errorCode).toBe("MISSING_REQUIRED_FIELD");
    expect(body.lastFailure.errorDetails.field).toBe("title");
    expect(body.lastFailure.rawBody).toBe('{"content":"x"}');
    expect(body.recentFailures).toHaveLength(1);
    expect(body.recentFailures[0].errorCode).toBe("MISSING_REQUIRED_FIELD");
    expect(body.lastReceived.keys).toEqual(["content"]);
  });

  it("matches the frozen response-shape contract the n8n agent depends on", async () => {
    await seedFailureScenario();
    const response = await GET(
      makeDebugRequest({ userId: USER_ID, token: TOKEN }),
    );
    const body = await response.json();
    // Any field rename or removal in the activation-debug response breaks
    // the n8n agent silently — this snapshot turns that into a loud failure.
    expect(normalizeForSnapshot(body)).toMatchSnapshot();
  });
});
