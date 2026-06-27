export interface BriefResult {
  summaryText: string;
  actionItemsJson: string[];
}

/** Hard ceiling on the OpenAI call so a hung request can't stall a webhook. */
const OPENAI_TIMEOUT_MS = 10_000;

/**
 * Turn a webhook payload into a brief (summary + action items).
 *
 * This is wired into the ingest path, so it MUST be total — it must never
 * throw. A valid webhook has to produce its SUCCESS brief no matter what:
 * "activated" is defined as "has ≥ 1 SUCCESS brief", and the whole n8n rescue
 * agent keys off that. So the LLM is treated as a best-effort enhancement over
 * a guaranteed-correct fallback: if no key is configured, or the OpenAI call
 * fails for ANY reason (network, timeout, rate limit, non-JSON response), we
 * degrade to the deterministic `generateFallback` rather than blocking ingest.
 */
export async function generateBrief(inputJson: unknown): Promise<BriefResult> {
  const openaiKey = process.env.OPENAI_API_KEY;

  if (openaiKey) {
    try {
      return await generateWithOpenAI(inputJson, openaiKey);
    } catch (err) {
      // Never let an AI hiccup turn a valid webhook into a non-activation.
      console.error("generateBrief: OpenAI path failed, using fallback —", err);
      return generateFallback(inputJson);
    }
  }

  return generateFallback(inputJson);
}

async function generateWithOpenAI(
  inputJson: unknown,
  apiKey: string
): Promise<BriefResult> {
  const prompt = `You are a helpful assistant that creates brief summaries from webhook payloads.

Given this JSON payload:
${JSON.stringify(inputJson, null, 2)}

Please provide:
1. A concise human-readable summary (1-2 sentences)
2. 2-5 actionable next steps based on this data

Respond in JSON format:
{
  "summary": "your summary here",
  "actionItems": ["action 1", "action 2", ...]
}`;

  // Abort the request if OpenAI is slow — the fallback is instant and ingest
  // latency matters (webhook senders time out).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 500,
        // Force well-formed JSON so JSON.parse below can't choke on prose or
        // markdown fences. (Any model that rejects this just routes to fallback.)
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content in OpenAI response");
    }

    const parsed = JSON.parse(content);

    return {
      summaryText: parsed.summary || "Summary unavailable",
      actionItemsJson: parsed.actionItems || [],
    };
  } finally {
    clearTimeout(timer);
  }
}

export function generateFallback(inputJson: unknown): BriefResult {
  const obj = inputJson as Record<string, unknown>;
  const keys = Object.keys(obj);

  const summaryText = `Received payload with keys: ${keys.join(", ")}`;

  const actionItems: string[] = [];

  if (obj.email || obj.customer_email) {
    actionItems.push("Follow up with customer via email");
  }
  if (obj.amount || obj.total || obj.price) {
    actionItems.push("Review transaction details and update records");
  }
  if (obj.status) {
    actionItems.push(`Monitor status changes (current: ${obj.status})`);
  }
  if (obj.type || obj.event_type) {
    actionItems.push(`Process ${obj.type || obj.event_type} event accordingly`);
  }

  if (actionItems.length === 0) {
    actionItems.push("Review incoming data");
    actionItems.push("Determine if any action is required");
  }

  return { summaryText, actionItemsJson: actionItems };
}
