import path from "node:path";
import { fileURLToPath } from "node:url";

import { reconcileFinalResultIdentityAliasesDay } from "../core/final-result-identity-reconciliation.js";
import { getProductionIdentityResolver } from "../core/production-identity-resolver-runtime.js";
import { resolveDataPath } from "../storage/data-root.js";

export function reconcileProductionIdentityDerivedDay(dayKey, { write = false } = {}) {
  return reconcileFinalResultIdentityAliasesDay(dayKey, {
    finalResultsRoot: resolveDataPath("final-results"),
    resolver: getProductionIdentityResolver(),
    write,
  });
}

const isMain = process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  try {
    const dayKey = process.argv.slice(2).find(arg => !arg.startsWith("--"));
    const write = process.argv.includes("--write");
    const result = reconcileProductionIdentityDerivedDay(dayKey, { write });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 2;
  } catch (error) {
    console.error("[production-identity-derived-reconcile] failed", error);
    process.exitCode = 1;
  }
}
