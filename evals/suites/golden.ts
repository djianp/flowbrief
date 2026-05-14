import {
  RESCUE_SYSTEM_PROMPT,
  buildRescueUserPrompt,
  validateRescueOutput,
} from "../../src/lib/rescue-prompt";
import { callOpenAI } from "../lib/openai-client";
import {
  scoreDiagnosisNamesError,
  scoreFixStepsAddressError,
  scoreEmailSpecific,
} from "../lib/score";
import type { SuiteResult, FixtureResult, CheckResult } from "../lib/report";
import { GOLDEN_FIXTURES } from "../fixtures/golden";

/**
 * E-golden: run the real rescue prompt over one fixture per ErrorCode and
 * score whether the output names the right failure, gives fixes that address
 * it, and stays specific to THIS user. Not "required" — these are quality
 * signals to track across prompt/model changes, not hard CI gates.
 */
async function run(): Promise<SuiteResult> {
  const fixtures: FixtureResult[] = [];

  for (const fx of GOLDEN_FIXTURES) {
    const result = await callOpenAI({
      system: RESCUE_SYSTEM_PROMPT,
      user: buildRescueUserPrompt(fx.input),
    });

    const checks: CheckResult[] = [];
    const validation = validateRescueOutput(result.parsed);
    checks.push({
      name: "schema",
      pass: validation.valid,
      detail: validation.valid
        ? "matches the rescue output schema"
        : (result.parseError ?? validation.errors.join("; ")),
    });

    if (validation.valid) {
      checks.push({
        name: "diagnosis-names-error",
        ...scoreDiagnosisNamesError(validation.value, fx.input.errorCode),
      });
      checks.push({
        name: "fixsteps-address-error",
        ...scoreFixStepsAddressError(validation.value, fx.input.errorCode),
      });
      checks.push({
        name: "email-specific",
        ...scoreEmailSpecific(validation.value, fx.input),
      });
    }

    fixtures.push({ fixtureId: fx.id, checks, latencyMs: result.latencyMs });
  }

  return { suite: "golden", fixtures, required: false };
}

export const goldenSuite = { run };
