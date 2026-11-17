import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadReviewedTeamAliasBindings } from "../engine-v1/core/reviewed-team-alias-bindings.js";

// Run from any working directory. No changes to any source or data file.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ledger = path.join(root, "data/identity-decisions/production-reviewed-team-aliases.v1.json");
if (!fs.existsSync(ledger)) {
  throw new Error("REVIEWED_ALIAS_LEDGER_MISSING");
}

const result = loadReviewedTeamAliasBindings(root);
if (!Array.isArray(result) || result.length === 0) {
  throw new Error("REVIEWED_ALIAS_LEDGER_EMPTY");
}
console.log(`REVIEWED_ALIAS_SOURCE_INTEGRITY_PASS bindings=${result.length}`);
