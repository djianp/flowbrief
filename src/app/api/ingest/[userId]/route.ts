import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/events";
import { createBrief } from "@/lib/briefs";
import {
  ErrorCode,
  createErrorResponse,
  createSuccessResponse,
} from "@/lib/webhook-errors";
import { validateWebhookPayload } from "@/lib/webhook-validation";
import {
  safeReadBody,
  extractRequestMeta,
  buildFailureProperties,
} from "@/lib/request-utils";

const MAX_PAYLOAD_SIZE = 20 * 1024; // 20KB

type RouteParams = { params: Promise<{ userId: string }> };

/**
 * Log webhook_received event.
 * When user doesn't exist, logs with userId=undefined and attemptedUserId in properties.
 */
async function logWebhookReceived(
  userId: string | undefined,
  attemptedUserId: string,
  request: NextRequest,
  rawBody: string | null
) {
  const meta = extractRequestMeta(request, rawBody);
  const properties: Record<string, unknown> = { ...meta };
  if (!userId) {
    properties.attemptedUserId = attemptedUserId;
  }
  await logEvent({
    userId,
    eventName: "webhook_received",
    propertiesJson: properties,
  });
}

/**
 * Log webhook_failed event.
 * When user doesn't exist, logs with userId=undefined and attemptedUserId in properties.
 */
async function logWebhookFailed(
  userId: string | undefined,
  attemptedUserId: string,
  request: NextRequest,
  rawBody: string | null,
  errorCode: string,
  errorDetails: Record<string, unknown>
) {
  const properties = buildFailureProperties(request, rawBody, errorCode, errorDetails);
  if (!userId) {
    properties.attemptedUserId = attemptedUserId;
  }
  await logEvent({
    userId,
    eventName: "webhook_failed",
    propertiesJson: properties,
  });
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  const { userId: paramUserId } = await params;

  // Read body once at the start
  const rawBody = await safeReadBody(request);

  // Check user existence first to determine safe userId for logging
  const user = await prisma.user.findUnique({ where: { id: paramUserId } });
  const safeUserId: string | undefined = user ? paramUserId : undefined;

  // Log webhook_received for every request
  await logWebhookReceived(safeUserId, paramUserId, request, rawBody);

  // If user doesn't exist, fail with USER_NOT_FOUND
  if (!user) {
    const errorDetails = { userId: paramUserId };
    await logWebhookFailed(safeUserId, paramUserId, request, rawBody, ErrorCode.USER_NOT_FOUND, errorDetails);
    return NextResponse.json(
      createErrorResponse(ErrorCode.USER_NOT_FOUND, errorDetails),
      { status: 404 }
    );
  }

  // Validate Content-Type
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const errorDetails = {
      expected: "application/json",
      received: contentType || "none",
    };
    await logWebhookFailed(safeUserId, paramUserId, request, rawBody, ErrorCode.UNSUPPORTED_CONTENT_TYPE, errorDetails);
    return NextResponse.json(
      createErrorResponse(ErrorCode.UNSUPPORTED_CONTENT_TYPE, errorDetails),
      { status: 415 }
    );
  }

  // Check payload size via header
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > MAX_PAYLOAD_SIZE) {
    const errorDetails = {
      maxBytes: MAX_PAYLOAD_SIZE,
      receivedBytes: parseInt(contentLength),
    };
    await logWebhookFailed(safeUserId, paramUserId, request, rawBody, ErrorCode.PAYLOAD_TOO_LARGE, errorDetails);
    return NextResponse.json(
      createErrorResponse(ErrorCode.PAYLOAD_TOO_LARGE, errorDetails),
      { status: 413 }
    );
  }

  // Handle body read failure
  if (rawBody === null) {
    const errorDetails = { message: "Failed to read request body" };
    await logWebhookFailed(safeUserId, paramUserId, request, rawBody, ErrorCode.INVALID_JSON, errorDetails);
    return NextResponse.json(
      createErrorResponse(ErrorCode.INVALID_JSON, errorDetails),
      { status: 400 }
    );
  }

  // Check actual body size
  if (rawBody.length > MAX_PAYLOAD_SIZE) {
    const errorDetails = {
      maxBytes: MAX_PAYLOAD_SIZE,
      receivedBytes: rawBody.length,
    };
    await logWebhookFailed(safeUserId, paramUserId, request, rawBody, ErrorCode.PAYLOAD_TOO_LARGE, errorDetails);
    return NextResponse.json(
      createErrorResponse(ErrorCode.PAYLOAD_TOO_LARGE, errorDetails),
      { status: 413 }
    );
  }

  // Parse JSON
  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(rawBody);
  } catch {
    const errorDetails = { message: "Request body is not valid JSON" };
    await logWebhookFailed(safeUserId, paramUserId, request, rawBody, ErrorCode.INVALID_JSON, errorDetails);
    return NextResponse.json(
      createErrorResponse(ErrorCode.INVALID_JSON, errorDetails),
      { status: 400 }
    );
  }

  // Validate payload schema
  const validation = validateWebhookPayload(rawPayload);
  if (!validation.valid) {
    await logWebhookFailed(
      safeUserId,
      paramUserId,
      request,
      rawBody,
      validation.error!.errorCode,
      validation.error!.errorDetails
    );
    return NextResponse.json(validation.error, { status: 422 });
  }

  const payload = validation.payload;

  // Create brief from validated payload
  await createBrief({
    userId: paramUserId,
    status: "SUCCESS",
    inputJson: payload,
    summaryText: payload.title,
    actionItemsJson: [],
  });

  return NextResponse.json(createSuccessResponse());
}

// Handle non-POST methods
async function handleInvalidMethod(
  request: NextRequest,
  { params }: RouteParams,
  method: string
) {
  const { userId: paramUserId } = await params;
  const rawBody = await safeReadBody(request);

  // Check user existence to determine safe userId for logging
  const user = await prisma.user.findUnique({ where: { id: paramUserId } });
  const safeUserId: string | undefined = user ? paramUserId : undefined;

  // Log webhook_received for every request
  await logWebhookReceived(safeUserId, paramUserId, request, rawBody);

  const errorDetails = {
    allowed: ["POST"],
    received: method,
  };
  await logWebhookFailed(safeUserId, paramUserId, request, rawBody, ErrorCode.INVALID_METHOD, errorDetails);

  return NextResponse.json(
    createErrorResponse(ErrorCode.INVALID_METHOD, errorDetails),
    { status: 405 }
  );
}

export async function GET(request: NextRequest, routeParams: RouteParams) {
  return handleInvalidMethod(request, routeParams, "GET");
}

export async function PUT(request: NextRequest, routeParams: RouteParams) {
  return handleInvalidMethod(request, routeParams, "PUT");
}

export async function DELETE(request: NextRequest, routeParams: RouteParams) {
  return handleInvalidMethod(request, routeParams, "DELETE");
}

export async function PATCH(request: NextRequest, routeParams: RouteParams) {
  return handleInvalidMethod(request, routeParams, "PATCH");
}
