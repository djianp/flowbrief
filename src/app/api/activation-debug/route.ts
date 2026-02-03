import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Safely parse JSON string, returning empty object on failure
 */
function safeParseJson(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

export async function GET(request: NextRequest) {
  // Security: Validate internal token
  const token = request.headers.get("x-internal-token");
  const expectedToken = process.env.INTERNAL_API_TOKEN;

  if (!expectedToken || token !== expectedToken) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  // Validate userId query param
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "MISSING_USER_ID" },
      { status: 400 }
    );
  }

  // Query data in parallel
  const [hasSuccessBrief, lastAttemptEvent, lastFailureEvent, recentFailureEvents, lastReceivedEvent] =
    await Promise.all([
      // Check if user has at least one SUCCESS brief
      prisma.brief.findFirst({
        where: { userId, status: "SUCCESS" },
        select: { id: true },
      }),

      // Most recent event (any eventName)
      prisma.event.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),

      // Most recent webhook_failed event
      prisma.event.findFirst({
        where: { userId, eventName: "webhook_failed" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, propertiesJson: true },
      }),

      // Last 5 webhook_failed events
      prisma.event.findMany({
        where: { userId, eventName: "webhook_failed" },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { createdAt: true, propertiesJson: true },
      }),

      // Most recent webhook_received event
      prisma.event.findFirst({
        where: { userId, eventName: "webhook_received" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, propertiesJson: true },
      }),
    ]);

  // Build lastFailure object
  let lastFailure: {
    at: string | null;
    errorCode: string | null;
    errorDetails: Record<string, unknown>;
    httpMethod: string | null;
    path: string | null;
    contentType: string | null;
    rawBody: string | null;
    headers: Record<string, unknown>;
  };

  if (lastFailureEvent) {
    const props = safeParseJson(lastFailureEvent.propertiesJson);
    lastFailure = {
      at: lastFailureEvent.createdAt.toISOString(),
      errorCode: (props.errorCode as string) ?? null,
      errorDetails: (props.errorDetails as Record<string, unknown>) ?? {},
      httpMethod: (props.httpMethod as string) ?? null,
      path: (props.path as string) ?? null,
      contentType: (props.contentType as string) ?? null,
      rawBody: (props.rawBody as string) ?? null,
      headers: (props.headers as Record<string, unknown>) ?? {},
    };
  } else {
    lastFailure = {
      at: null,
      errorCode: null,
      errorDetails: {},
      httpMethod: null,
      path: null,
      contentType: null,
      rawBody: null,
      headers: {},
    };
  }

  // Build recentFailures array
  const recentFailures = recentFailureEvents.map((event) => {
    const props = safeParseJson(event.propertiesJson);
    return {
      at: event.createdAt.toISOString(),
      errorCode: (props.errorCode as string) ?? null,
    };
  });

  // Build lastReceived object
  let lastReceived: {
    at: string | null;
    httpMethod: string | null;
    contentType: string | null;
    bodySize: number | null;
    keysCount: number | null;
    keys: string[] | null;
  };

  if (lastReceivedEvent) {
    const props = safeParseJson(lastReceivedEvent.propertiesJson);
    lastReceived = {
      at: lastReceivedEvent.createdAt.toISOString(),
      httpMethod: (props.httpMethod as string) ?? null,
      contentType: (props.contentType as string) ?? null,
      bodySize: (props.bodySize as number) ?? null,
      keysCount: (props.keysCount as number) ?? null,
      keys: (props.keys as string[]) ?? null,
    };
  } else {
    lastReceived = {
      at: null,
      httpMethod: null,
      contentType: null,
      bodySize: null,
      keysCount: null,
      keys: null,
    };
  }

  return NextResponse.json({
    ok: true,
    userId,
    activated: hasSuccessBrief !== null,
    activationDefinition: "user has at least one SUCCESS brief",
    lastAttemptAt: lastAttemptEvent?.createdAt.toISOString() ?? null,
    lastFailure,
    recentFailures,
    lastReceived,
  });
}
