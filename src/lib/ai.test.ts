import { describe, it, expect, vi, afterEach } from "vitest";
import { generateBrief, generateFallback } from "./ai";

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

// generateBrief is wired into the ingest path. The contract that matters most:
// it is TOTAL — it never throws — so a valid webhook always produces its
// SUCCESS brief even when OpenAI is misconfigured, down, or slow. We stub fetch
// so these stay hermetic; no real network. (Results are compared against
// generateFallback() of the same input so they can't drift from the heuristic.)
describe("generateBrief", () => {
  const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (ORIGINAL_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = ORIGINAL_KEY;
  });

  it("uses the deterministic fallback (no network) when no key is configured", async () => {
    delete process.env.OPENAI_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await generateBrief({ amount: 10 });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toEqual(generateFallback({ amount: 10 }));
  });

  it("returns the parsed OpenAI summary + action items on success", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: "A $50 payment from Acme was processed.",
                  actionItems: ["Send receipt", "Update the ledger"],
                }),
              },
            },
          ],
        }),
      }),
    );

    const result = await generateBrief({ title: "Payment", content: "$50" });

    expect(result.summaryText).toBe("A $50 payment from Acme was processed.");
    expect(result.actionItemsJson).toEqual(["Send receipt", "Update the ledger"]);
  });

  it("degrades to the fallback (never throws) when the OpenAI call rejects", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await generateBrief({ email: "a@b.io" });

    // Identical to the no-key path — a valid webhook is never blocked.
    expect(result).toEqual(generateFallback({ email: "a@b.io" }));
  });

  it("degrades to the fallback when OpenAI returns a non-OK status", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        text: async () => "429 Too Many Requests",
      }),
    );

    const result = await generateBrief({ status: "open" });

    expect(result).toEqual(generateFallback({ status: "open" }));
  });
});
