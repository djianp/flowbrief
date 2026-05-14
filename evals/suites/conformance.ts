import {
  RESCUE_SYSTEM_PROMPT,
  buildRescueUserPrompt,
} from "../../src/lib/rescue-prompt";
import { ErrorCode } from "../../src/lib/webhook-errors";
import { callOpenAI } from "../lib/openai-client";
import { scoreSchema } from "../lib/score";
import type { SuiteResult, FixtureResult, CheckResult } from "../lib/report";
import { GOLDEN_FIXTURES } from "../fixtures/golden";

/** Runs per ErrorCode — raise for a stronger statistical signal, at token cost. */
const RUNS_PER_CODE = 3;

/**
 * E-conformance (pairs with guardrail G-schema): run the prompt N times per
 * ErrorCode and assert EVERY response parses and matches RESCUE_OUTPUT_SCHEMA.
 * Required: if the prompt can't reliably produce schema-valid JSON, the n8n
 * "Parse AI JSON" guardrail will be routing real users to the escalate branch.
 */
async function run(): Promise<SuiteResult> {
  const fixtures: FixtureResult[] = [];

  for (const code of Object.values(ErrorCode)) {
    const fx = GOLDEN_FIXTURES.find((f) => f.input.errorCode === code);
    if (!fx) continue;

    const checks: CheckResult[] = [];
    let totalLatency = 0;
    for (let i = 1; i <= RUNS_PER_CODE; i++) {
      const result = await callOpenAI({
        system: RESCUE_SYSTEM_PROMPT,
        user: buildRescueUserPrompt(fx.input),
      });
      totalLatency += result.latencyMs;
      checks.push({ name: `run ${i}`, ...scoreSchema(result.parsed) });
    }

    fixtures.push({
      fixtureId: `conformance:${code}`,
      checks,
      latencyMs: Math.round(totalLatency / RUNS_PER_CODE),
    });
  }

  return { suite: "conformance", fixtures, required: true };
}

export const conformanceSuite = { run };
