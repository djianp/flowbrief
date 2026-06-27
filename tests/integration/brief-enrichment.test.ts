import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createBrief, updateBriefContent } from "@/lib/briefs";
import { enrichBrief } from "@/lib/brief-enrichment";
import { resetDb, seedUser } from "../helpers/db";

const USER_ID = "test-user-1";

beforeEach(async () => {
  await resetDb();
  await seedUser({ id: USER_ID });
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** A freshly-ingested brief: SUCCESS, with the placeholder summary the route
 *  writes synchronously (the title) before the background job runs. */
async function makePlaceholderBrief() {
  return createBrief({
    userId: USER_ID,
    status: "SUCCESS",
    inputJson: { title: "Order #1", content: "A new order" },
    summaryText: "Order #1",
    actionItemsJson: [],
  });
}

describe("updateBriefContent", () => {
  it("overwrites summaryText and actionItemsJson", async () => {
    const brief = await makePlaceholderBrief();

    await updateBriefContent(brief.id, {
      summaryText: "An AI-written summary",
      actionItemsJson: ["Do X", "Do Y"],
    });

    const updated = await prisma.brief.findUnique({ where: { id: brief.id } });
    expect(updated?.summaryText).toBe("An AI-written summary");
    expect(JSON.parse(updated!.actionItemsJson)).toEqual(["Do X", "Do Y"]);
  });
});

describe("enrichBrief", () => {
  // No OPENAI_API_KEY in the test env (cleared in tests/setup/env.ts), so
  // generateBrief takes the deterministic fallback — hermetic, no network.
  it("replaces the placeholder summary with generated content", async () => {
    const brief = await makePlaceholderBrief();

    // Mirror what the route passes: the validated payload, which always carries
    // all four schema keys (source/timestamp present-but-undefined).
    await enrichBrief(brief.id, {
      title: "Order #1",
      content: "A new order",
      source: undefined,
      timestamp: undefined,
    });

    const updated = await prisma.brief.findUnique({ where: { id: brief.id } });
    expect(updated?.summaryText).toBe(
      "Received payload with keys: title, content, source, timestamp",
    );
    expect(JSON.parse(updated!.actionItemsJson)).toEqual([
      "Review incoming data",
      "Determine if any action is required",
    ]);
  });

  it("never rejects when the brief id does not exist (background-safe)", async () => {
    // prisma.update on a missing row throws; as a fire-and-forget task,
    // enrichBrief must swallow that rather than surface an unhandled rejection.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      enrichBrief("nonexistent-brief-id", { title: "x", content: "y" }),
    ).resolves.toBeUndefined();

    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
