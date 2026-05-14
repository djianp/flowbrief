import { describe, it, expect } from "vitest";
import { ErrorCode } from "@/lib/webhook-errors";
import { FIX_HINTS } from "@/lib/rescue-prompt";

// E-taxonomy: the executable twin of the "published cross-system contract"
// comment on the ErrorCode enum. The n8n rescue agent's Switch node branches
// on these exact strings, so a silent rename or removal here would silently
// degrade the agent. These tests turn that into a loud CI failure.

describe("ErrorCode taxonomy — frozen cross-system contract", () => {
  // The canonical set, hard-coded on purpose. This is intentionally NOT
  // derived from the enum — deriving it would make the test tautological.
  // A rename or removal fails this immediately; ADDING a member also fails
  // it, which is the point: it forces a conscious, same-commit update here,
  // in rescue-prompt.ts's FIX_HINTS, and in the n8n Switch node.
  const CANONICAL_ERROR_CODES = [
    "INVALID_FIELD_TYPE",
    "INVALID_JSON",
    "INVALID_METHOD",
    "MISSING_REQUIRED_FIELD",
    "PAYLOAD_TOO_LARGE",
    "UNAUTHORIZED",
    "UNSUPPORTED_CONTENT_TYPE",
    "USER_NOT_FOUND",
  ];

  it("contains exactly the canonical set of error codes", () => {
    expect(Object.values(ErrorCode).sort()).toEqual(
      [...CANONICAL_ERROR_CODES].sort(),
    );
  });

  it("uses an identical key and value for every member", () => {
    // The n8n Switch node's branch labels rely on key === value.
    for (const [key, value] of Object.entries(ErrorCode)) {
      expect(value).toBe(key);
    }
  });

  it("has a FIX_HINTS entry for every ErrorCode value plus DEFAULT, and nothing else", () => {
    // Pairs G-contract with the rescue prompt: every code the n8n Switch can
    // branch onto must have a fix hint, and there must be no orphan hints.
    const expectedKeys = [...Object.values(ErrorCode), "DEFAULT"].sort();
    expect(Object.keys(FIX_HINTS).sort()).toEqual(expectedKeys);
  });
});
