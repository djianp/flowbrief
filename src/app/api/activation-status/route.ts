import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLastBrief, getLastSuccessBrief } from "@/lib/briefs";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");

  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "userId parameter is required" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "User not found" },
      { status: 404 }
    );
  }

  const lastBrief = await getLastBrief(userId);
  const lastSuccessBrief = await getLastSuccessBrief(userId);

  const activated = lastSuccessBrief !== null;
  const lastBriefStatus = lastBrief?.status as "SUCCESS" | "FAILED" | null ?? null;
  const lastError = lastBrief?.status === "FAILED" ? lastBrief.errorMessage : null;
  const lastSuccessAt = lastSuccessBrief?.createdAt?.toISOString() ?? null;

  return NextResponse.json({
    activated,
    lastBriefStatus,
    lastError,
    lastSuccessAt,
  });
}
