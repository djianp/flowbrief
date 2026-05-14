import {
  RESCUE_MODEL,
  RESCUE_REQUEST_DEFAULTS,
} from "../../src/lib/rescue-prompt";

export interface OpenAICallResult {
  /** The model's raw message content, before fence-stripping. */
  raw: string;
  /** The parsed JSON, or null if it would not parse. */
  parsed: unknown | null;
  /** Set when parsing failed — evals score parse failures, they don't crash. */
  parseError?: string;
  latencyMs: number;
}

interface CallOptions {
  system: string;
  user: string;
  model?: string;
  timeoutMs?: number;
  maxAttempts?: number;
}

/**
 * Strip a ```json ... ``` fence and any prose preamble before the first `{`,
 * mirroring the n8n "Parse AI JSON" node. Models sometimes wrap JSON output
 * even when asked for raw JSON.
 */
export function stripJsonFences(text: string): string {
  let t = text.trim();
  const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) t = fenced[1].trim();
  // Drop a prose preamble / trailer around the JSON object, if any.
  const firstBrace = t.indexOf("{");
  const lastBrace = t.lastIndexOf("}");
  if (firstBrace > 0 && lastBrace > firstBrace) {
    t = t.slice(firstBrace, lastBrace + 1);
  }
  return t;
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Call the OpenAI chat-completions API with the rescue model + defaults.
 * Bounded timeout (AbortController) and a small retry on 429/5xx/network
 * errors — this mirrors what the G-timeout guardrail asks of the n8n node.
 * Returns parse failures as data (parsed: null) rather than throwing, so a
 * malformed response is something an eval can score.
 */
export async function callOpenAI(
  opts: CallOptions,
): Promise<OpenAICallResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const model = opts.model ?? RESCUE_MODEL;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const maxAttempts = opts.maxAttempts ?? 3;

  const body = JSON.stringify({
    model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    ...RESCUE_REQUEST_DEFAULTS,
  });

  const started = Date.now();
  let lastError = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body,
          signal: controller.signal,
        },
      );
      clearTimeout(timer);

      // Transient — retry with linear backoff.
      if (res.status === 429 || res.status >= 500) {
        lastError = `HTTP ${res.status}`;
        if (attempt < maxAttempts) await sleep(attempt * 1000);
        continue;
      }
      if (!res.ok) {
        throw new Error(
          `OpenAI API error ${res.status}: ${await res.text()}`,
        );
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content ?? "";
      const cleaned = stripJsonFences(content);
      const latencyMs = Date.now() - started;
      try {
        return { raw: content, parsed: JSON.parse(cleaned), latencyMs };
      } catch (e) {
        return {
          raw: content,
          parsed: null,
          parseError: e instanceof Error ? e.message : String(e),
          latencyMs,
        };
      }
    } catch (e) {
      clearTimeout(timer);
      lastError = e instanceof Error ? e.message : String(e);
      if (attempt < maxAttempts) await sleep(attempt * 1000);
    }
  }

  throw new Error(
    `OpenAI call failed after ${maxAttempts} attempts: ${lastError}`,
  );
}
