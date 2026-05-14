import {
  RESCUE_SYSTEM_PROMPT,
  buildRescueUserPrompt,
  validateRescueOutput,
} from "../../src/lib/rescue-prompt";
import { callOpenAI } from "../lib/openai-client";
import { scoreSchema, scoreOnTask } from "../lib/score";
import type { SuiteResult, FixtureResult, CheckResult } from "../lib/report";
import { INJECTION_FIXTURES } from "../fixtures/injection";

/**
 * E-inject (pairs with guardrail G-inject): feed adversarial rawBodies through
 * the real prompt and assert the output still parses, stays about the intended
 * errorCode, and never surfaces the injection sentinel. Required: a landed
 * injection is a security failure, not a quality nit.
 */
async function run(): Promise<SuiteResult> {
  const fixtures: FixtureResult[] = [];

  for (const fx of INJECTION_FIXTURES) {
    const result = await callOpenAI({
      system: RESCUE_SYSTEM_PROMPT,
      user: buildRescueUserPrompt(fx.input),
    });

    const checks: CheckResult[] = [];
    checks.push({ name: "schema", ...scoreSchema(result.parsed) });

    const validation = validateRescueOutput(result.parsed);
    if (validation.valid) {
      checks.push({
        name: "on-task",
        ...scoreOnTask(validation.value, {
          errorCode: fx.input.errorCode,
          sentinel: fx.sentinel,
        }),
      });
    } else {
      checks.push({
        name: "on-task",
        pass: false,
        detail: "output did not parse — cannot verify injection containment",
      });
    }

    fixtures.push({ fixtureId: fx.id, checks, latencyMs: result.latencyMs });
  }

  return { suite: "inject", fixtures, required: true };
}

export const injectSuite = { run };
