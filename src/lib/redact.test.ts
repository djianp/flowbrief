import { describe, it, expect } from "vitest";
import { redactString, redactValue } from "./redact";

describe("redactString", () => {
  it("redacts a JWT", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.dozjgNryP4J3jVmNHDo7H_8YHQF";
    expect(redactString(jwt)).toBe("[REDACTED_JWT]");
  });

  it("redacts a Bearer token while keeping the scheme", () => {
    expect(redactString("authorization: Bearer abc123.def456-ghi")).toBe(
      "authorization: Bearer [REDACTED_TOKEN]",
    );
  });

  it("redacts an OpenAI-style API key", () => {
    expect(redactString("key is sk-proj-AbCdEf0123456789XyZ here")).toBe(
      "key is [REDACTED_API_KEY] here",
    );
  });

  it("redacts an AWS access key id", () => {
    expect(redactString("AKIAIOSFODNN7EXAMPLE")).toBe("[REDACTED_AWS_KEY]");
  });

  it("redacts an email address", () => {
    expect(redactString("contact jane.doe@example.com please")).toBe(
      "contact [REDACTED_EMAIL] please",
    );
  });

  it("redacts a long digit run (e.g. a card number)", () => {
    expect(redactString("card 4111111111111111 on file")).toBe(
      "card [REDACTED_DIGITS] on file",
    );
  });

  it("redacts only the secret inside a larger string, leaving benign data", () => {
    const out = redactString('{"note":"ping me at a@b.io","amount":49}');
    expect(out).toContain("[REDACTED_EMAIL]");
    expect(out).not.toContain("a@b.io");
    expect(out).toContain('"amount":49');
  });

  it("redacts multiple secrets of different kinds in one string", () => {
    const out = redactString("mail a@b.io key sk-ABCDEFGHIJ0123456789");
    expect(out).toContain("[REDACTED_EMAIL]");
    expect(out).toContain("[REDACTED_API_KEY]");
    expect(out).not.toContain("a@b.io");
    expect(out).not.toContain("sk-ABCDEF");
  });

  it("leaves benign text and short numbers unchanged (no over-redaction)", () => {
    expect(redactString("Test Payment Received")).toBe("Test Payment Received");
    expect(redactString("order 12345 total 49.00")).toBe(
      "order 12345 total 49.00",
    );
    // 10 digits — below the 12-digit threshold.
    expect(redactString("phone 5551234567")).toBe("phone 5551234567");
  });

  it("handles the empty string", () => {
    expect(redactString("")).toBe("");
  });
});

describe("redactValue", () => {
  it("redacts string leaves of a nested object, leaving non-strings intact", () => {
    const input = {
      apiKey: "sk-ABCDEFGHIJ0123456789",
      amount: 4200,
      nested: { email: "x@y.io", ok: true },
    };
    const out = redactValue(input) as {
      apiKey: string;
      amount: number;
      nested: { email: string; ok: boolean };
    };
    expect(out.apiKey).toBe("[REDACTED_API_KEY]");
    expect(out.amount).toBe(4200);
    expect(out.nested.email).toBe("[REDACTED_EMAIL]");
    expect(out.nested.ok).toBe(true);
  });

  it("redacts string elements of an array", () => {
    const out = redactValue(["a@b.io", "plain", 7]) as unknown[];
    expect(out[0]).toBe("[REDACTED_EMAIL]");
    expect(out[1]).toBe("plain");
    expect(out[2]).toBe(7);
  });

  it("returns null, numbers, booleans, and undefined unchanged", () => {
    expect(redactValue(null)).toBeNull();
    expect(redactValue(42)).toBe(42);
    expect(redactValue(false)).toBe(false);
    expect(redactValue(undefined)).toBeUndefined();
  });
});
