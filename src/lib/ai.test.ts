import { describe, it, expect } from "vitest";
import { generateFallback } from "./ai";

// generateBrief / generateWithOpenAI hit the network and are unused on the
// ingest path. Only generateFallback (pure, synchronous) is unit-tested here
// — it is the graceful-degradation path if ai.ts is ever wired in without an
// OPENAI_API_KEY configured.

describe("generateFallback", () => {
  it("summarizes the payload by listing its top-level keys", () => {
    const result = generateFallback({ email: "a@b.io", amount: 50 });
    expect(result.summaryText).toBe(
      "Received payload with keys: email, amount",
    );
  });

  it("suggests an email follow-up when an email field is present", () => {
    expect(generateFallback({ email: "a@b.io" }).actionItemsJson).toContain(
      "Follow up with customer via email",
    );
    expect(
      generateFallback({ customer_email: "a@b.io" }).actionItemsJson,
    ).toContain("Follow up with customer via email");
  });

  it("suggests a transaction review for amount / total / price fields", () => {
    const review = "Review transaction details and update records";
    expect(generateFallback({ amount: 10 }).actionItemsJson).toContain(review);
    expect(generateFallback({ total: 10 }).actionItemsJson).toContain(review);
    expect(generateFallback({ price: 10 }).actionItemsJson).toContain(review);
  });

  it("includes the current status when a status field is present", () => {
    expect(generateFallback({ status: "open" }).actionItemsJson).toContain(
      "Monitor status changes (current: open)",
    );
  });

  it("references the event type for type / event_type fields", () => {
    expect(generateFallback({ type: "refund" }).actionItemsJson).toContain(
      "Process refund event accordingly",
    );
    expect(
      generateFallback({ event_type: "signup" }).actionItemsJson,
    ).toContain("Process signup event accordingly");
  });

  it("falls back to generic action items for an unrecognized payload", () => {
    const result = generateFallback({});
    expect(result.summaryText).toBe("Received payload with keys: ");
    expect(result.actionItemsJson).toEqual([
      "Review incoming data",
      "Determine if any action is required",
    ]);
  });
});
