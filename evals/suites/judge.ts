import {
  RESCUE_SYSTEM_PROMPT,
  buildRescueUserPrompt,
  validateRescueOutput,
} from "../../src/lib/rescue-prompt";
import { callOpenAI } from "../lib/openai-client";
import type { SuiteResult, FixtureResult, CheckResult } from "../lib/report";
import { GOLDEN_FIXTURES } from "../fixtures/golden";

const JUDGE_SYSTEM_PROMPT = `You are a strict reviewer of customer-rescue emails. You are given the structured failure context and a draft rescue email. Score the draft on three axes, each an integer 1-5:
- specificity: does it name THIS user's actual failure (the field, header, or value), rather than a generic "having trouble?" note?
- correctness: is the fix advice actually correct for the stated errorCode?
- tone: is it friendly, concise, and non-condescending?
Respond with JSON only: {"specificity": number, "correctness": number, "tone": number, "rationale": string}`;

interface JudgeScore {
  specificity: number;
  correctness: number;
  tone: number;
  rationale: string;
}

function isJudgeScore(v: unknown): v is JudgeScore {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.specificity === "number" &&
    typeof o.correctness === "number" &&
    typeof o.tone === "number" &&
    typeof o.rationale === "string"
  );
}

/** Each axis must score at least this to pass. */
const AXIS_FLOOR = 3;

/**
 * E-judge: LLM-as-judge over the golden set. Generates a rescue email, then
 * has a SECOND model grade it on specificity / correctness / tone. Not
 * required (inherently fuzzy, and it doubles the token cost per fixture) —
 * keep it opt-in via `npm run eval judge`.
 */
async function run(): Promise<SuiteResult> {
  const fixtures: FixtureResult[] = [];

  for (const fx of GOLDEN_FIXTURES) {
    const generated = await callOpenAI({
      system: RESCUE_SYSTEM_PROMPT,
      user: buildRescueUserPrompt(fx.input),
    });
    const validation = validateRescueOutput(generated.parsed);

    const checks: CheckResult[] = [];
    if (!validation.valid) {
      checks.push({
        name: "judge",
        pass: false,
        detail: "draft did not parse — nothing to judge",
      });
      fixtures.push({
        fixtureId: fx.id,
        checks,
        latencyMs: generated.latencyMs,
      });
      continue;
    }

    const judgeUser = `Failure context:
- errorCode: ${fx.input.errorCode}
- errorDetails: ${JSON.stringify(fx.input.errorDetails)}

Draft email:
Subject: ${validation.value.email.subject}
Body: ${validation.value.email.body}`;

    const judged = await callOpenAI({
      system: JUDGE_SYSTEM_PROMPT,
      user: judgeUser,
    });
    const score = judged.parsed;

    if (!isJudgeScore(score)) {
      checks.push({
        name: "judge",
        pass: false,
        detail: "judge response was not a valid score object",
      });
    } else {
      checks.push({
        name: "specificity",
        pass: score.specificity >= AXIS_FLOOR,
        detail: `specificity ${score.specificity}/5 — ${score.rationale}`,
      });
      checks.push({
        name: "correctness",
        pass: score.correctness >= AXIS_FLOOR,
        detail: `correctness ${score.correctness}/5`,
      });
      checks.push({
        name: "tone",
        pass: score.tone >= AXIS_FLOOR,
        detail: `tone ${score.tone}/5`,
      });
    }

    fixtures.push({
      fixtureId: fx.id,
      checks,
      latencyMs: generated.latencyMs + judged.latencyMs,
    });
  }

  return { suite: "judge", fixtures, required: false };
}

export const judgeSuite = { run };
