# FlowBrief Eval Harness

**Layer 2 of the test strategy.** Unlike `npm test` (Vitest — hermetic,
offline, fast), the eval harness calls the **real OpenAI API** and consumes
tokens. It is run manually, never in the fast feedback loop and never as part
of `npm test`.

## What it evaluates

The harness exercises the *vendored* rescue prompt in `src/lib/rescue-prompt.ts`
— the exact same `RESCUE_SYSTEM_PROMPT` and `buildRescueUserPrompt` the n8n
agent uses. The eval and the thing actually shipped cannot drift apart.

| Suite | Question it answers | Pairs with |
| --- | --- | --- |
| `golden` | Does the rescue output name the right failure, give correct fixes, and stay specific? | — |
| `conformance` | Does the output *always* parse and match the schema? | guardrail G-schema |
| `inject` | Does the output stay on-task when the rawBody is adversarial? | guardrail G-inject |
| `judge` | LLM-as-judge: specificity / correctness / tone of the draft email | — |

Suites are registered in `evals/suites/index.ts` (added in Phase 7).

## Running

```bash
npm run eval              # all registered suites
npm run eval conformance  # one suite
npm run eval inject
```

Requires `OPENAI_API_KEY` in `.env` or `.env.local`. Without it, the harness
prints guidance and exits 1.

## Why `tsx`

The harness is plain TypeScript with no build step. `src/lib/rescue-prompt.ts`
imports the `ErrorCode` **enum**, and Node's `--experimental-strip-types`
cannot run enums — an enum is a runtime construct, not just type annotations to
delete. `tsx` runs the whole module graph (enums included) with zero config.
It is the only dependency the eval layer adds, and it is dev-only.

Eval files import application code with **relative paths**
(`../../src/lib/rescue-prompt`), not the `@/` alias — `tsx` and Node resolve
relative paths natively, whereas `@/` is a TypeScript/Vitest-only convenience.

## Exit code

`printScorecard` sets a non-zero exit code if any **required** suite has a
failing fixture (schema conformance and injection-resistance are required).
Use it as a separate CI job — never gate the fast `npm test` loop on it, and
budget for the token cost (it hits GPT-4o once per fixture, twice for `judge`).
