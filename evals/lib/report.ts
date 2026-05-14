/** One pass/fail check within a fixture's result. */
export interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}

/** The result of running every check against one fixture. */
export interface FixtureResult {
  fixtureId: string;
  checks: CheckResult[];
  /** Round-trip latency of the LLM call, if one was made. */
  latencyMs?: number;
}

/** The result of running one eval suite over its fixtures. */
export interface SuiteResult {
  suite: string;
  fixtures: FixtureResult[];
  /** If true, any failure here sets a non-zero process exit code. */
  required: boolean;
}

/**
 * Print a human-readable scorecard and set process.exitCode to 1 if any
 * REQUIRED suite had a failing fixture. Latency is reported per fixture —
 * this is also where the cost/latency-observability eval lives.
 */
export function printScorecard(results: SuiteResult[]): void {
  let totalChecks = 0;
  let passedChecks = 0;
  let totalLatency = 0;
  let latencySamples = 0;
  let hardFailure = false;

  for (const suite of results) {
    console.log(`\n=== ${suite.suite}${suite.required ? " (required)" : ""} ===`);
    for (const fx of suite.fixtures) {
      const passed = fx.checks.filter((c) => c.pass).length;
      totalChecks += fx.checks.length;
      passedChecks += passed;
      const allPass = passed === fx.checks.length;
      if (fx.latencyMs != null) {
        totalLatency += fx.latencyMs;
        latencySamples += 1;
      }
      const latency =
        fx.latencyMs != null ? ` (${fx.latencyMs}ms)` : "";
      console.log(
        `  ${allPass ? "✓" : "✗"} ${fx.fixtureId} — ${passed}/${fx.checks.length}${latency}`,
      );
      for (const c of fx.checks) {
        if (!c.pass) console.log(`      ✗ ${c.name}: ${c.detail}`);
      }
      if (!allPass && suite.required) hardFailure = true;
    }
  }

  console.log(
    `\n${passedChecks}/${totalChecks} checks passed across ${results.length} suite(s).`,
  );
  if (latencySamples > 0) {
    console.log(
      `Mean LLM latency: ${Math.round(totalLatency / latencySamples)}ms over ${latencySamples} call(s).`,
    );
  }
  if (hardFailure) {
    console.error("✗ A required eval suite had failures.");
    process.exitCode = 1;
  } else {
    console.log("✓ No required-suite failures.");
  }
}
