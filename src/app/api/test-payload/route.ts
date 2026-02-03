import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function POST() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const userId = session.user.id;

  const testPayload = {
    title: "Test Payment Received",
    content: "A demo payment of $49.00 USD was successfully processed.",
    source: "demo",
    timestamp: new Date().toISOString(),
  };

  // Get the base URL from environment or construct from request
  const baseUrl = process.env.AUTH_URL || "http://localhost:3000";

  const response = await fetch(`${baseUrl}/api/ingest/${userId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(testPayload),
  });

  const ingestResponse = await response.json();

  return NextResponse.json({ ok: true, ingestResponse });
}
