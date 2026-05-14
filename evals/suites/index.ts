import type { SuiteResult } from "../lib/report";
import { goldenSuite } from "./golden";
import { conformanceSuite } from "./conformance";
import { injectSuite } from "./inject";
import { judgeSuite } from "./judge";

/** A registered eval suite — a named thing that runs and returns a SuiteResult. */
export interface EvalSuite {
  run(): Promise<SuiteResult>;
}

// The Record<string, EvalSuite> annotation structurally enforces the suite
// shape — which is why the suite files don't need to import EvalSuite, and
// the import graph stays acyclic (index depends on suites, never the reverse).
export const SUITES: Record<string, EvalSuite> = {
  golden: goldenSuite,
  conformance: conformanceSuite,
  inject: injectSuite,
  judge: judgeSuite,
};
