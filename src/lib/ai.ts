export interface BriefResult {
  summaryText: string;
  actionItemsJson: string[];
}

export async function generateBrief(inputJson: unknown): Promise<BriefResult> {
  const openaiKey = process.env.OPENAI_API_KEY;

  if (openaiKey) {
    return generateWithOpenAI(inputJson, openaiKey);
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
    }),
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
}

function generateFallback(inputJson: unknown): BriefResult {
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
