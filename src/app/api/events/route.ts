import { NextRequest, NextResponse } from "next/server";
import { logEvent } from "@/lib/events";

export async function POST(request: NextRequest) {
  let body: { userId?: string; eventName?: string; propertiesJson?: Record<string, unknown> };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { userId, eventName, propertiesJson } = body;

  if (!eventName || typeof eventName !== "string") {
    return NextResponse.json(
      { ok: false, error: "eventName is required and must be a string" },
      { status: 400 }
    );
  }

  if (propertiesJson && typeof propertiesJson !== "object") {
    return NextResponse.json(
      { ok: false, error: "propertiesJson must be an object" },
      { status: 400 }
    );
  }

  const event = await logEvent({
    userId,
    eventName,
    propertiesJson: propertiesJson || {},
  });

  return NextResponse.json({ ok: true, eventId: event.id });
}
