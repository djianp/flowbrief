// Must be first: populates process.env (OPENAI_API_KEY) before anything reads it.
import "./lib/env";
import { SUITES } from "./suites/index";
import { printScorecard, type SuiteResult } from "./lib/report";

function usage(): void {
  const registered = Object.keys(SUITES);
  console.log(
    `Usage: npm run eval [suite]\n\n` +
      `  suite: ${registered.length ? registered.join(" | ") : "(none registered yet)"} | all (default)\n\n` +
      `Layer 2 of the test strategy: this calls the real OpenAI API and\n` +
      `consumes tokens. Requires OPENAI_API_KEY in .env or .env.local.\n` +
      `See evals/README.md.`,
  );
}

async function main(): Promise<void> {
  const arg = process.argv[2];

  if (arg === "--help" || arg === "-h") {
    usage();
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error("✗ OPENAI_API_KEY is not set — cannot run evals.\n");
    usage();
    process.exitCode = 1;
    return;
  }

  const registered = Object.keys(SUITES);
  if (registered.length === 0) {
    console.log("Eval harness is wired up, but no suites are registered yet.");
    console.log(
      "(Suites are added in Phase 7: golden, conformance, inject, judge.)",
    );
    return;
  }

  const selected =
    !arg || arg === "all"
      ? registered
      : registered.includes(arg)
        ? [arg]
        : [];

  if (selected.length === 0) {
    console.error(`✗ Unknown suite: ${arg}\n`);
    usage();
    process.exitCode = 1;
    return;
  }

  const results: SuiteResult[] = [];
  for (const name of selected) {
    console.log(`\n▶ Running eval suite: ${name}`);
    results.push(await SUITES[name].run());
  }
  printScorecard(results);
}

main().catch((err) => {
  console.error("Eval run failed:", err);
  process.exitCode = 1;
});
