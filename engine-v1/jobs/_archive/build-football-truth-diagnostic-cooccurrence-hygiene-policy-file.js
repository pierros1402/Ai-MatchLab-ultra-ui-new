import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `diagnostic-cooccurrence-hygiene-policy-${today}`);
const outPath = path.join(outDir, `diagnostic-cooccurrence-hygiene-policy-${today}.json`);

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function shaText(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

await fs.mkdir(outDir, { recursive: true });

const policy = {
  status: "passed",
  runner: "diagnostic_cooccurrence_hygiene_policy",
  contractVersion: 1,
  output: rel(outPath),
  purpose: "Prevent old aggregate diagnostics from reintroducing false source-family/route assignments through co-occurrence.",
  ruleSet: {
    historicalDiagnosticsAreAuditOnly: true,
    aggregateDiagnosticsCannotAssignSourceFamily: true,
    aggregateDiagnosticsCannotAssignOfficialRoute: true,
    aggregateDiagnosticsCannotPromoteSlugFamilyPairs: true,
    familyAssignmentRequiresPerSlugRouteEvidence: true,
    perSlugRouteEvidenceMustBeSameRowOrSameObject: true,
    sourceFamilyMustBeExplicitFieldNotTextCooccurrence: true,
    routeUrlMustBeExplicitFieldNotTextCooccurrence: true,
    oldDiagnosticsMayOnlyContributeLiteralSlugPresence: true,
    oldDiagnosticsMayContributePriorRunStatusOnlyWhenStatusFieldIsExplicit: true,
    selfGeneratedPlannerFilesMustNotBeUsedAsEvidence: true,
    productionOrTruthInferenceFromDiagnosticsForbidden: true
  },
  bannedEvidencePatterns: [
    "family assigned because slug and family keyword appear somewhere in same large JSON file",
    "source route assigned because slug and official domain appear in different rows of same diagnostic",
    "safe runner inferred because historical runner name appears in same directory",
    "current planner output used as its own evidence",
    "aggregate inventory file used as per-slug source authority"
  ],
  allowedEvidencePatterns: [
    "same JSON object has slug plus explicit sourceFamily plus explicit routeUrl",
    "same JSONL row has slug plus explicit sourceFamily plus explicit routeUrl",
    "verified proof output has slug plus validated row counts and guardrails",
    "approval board row has slug plus eligible status after verified proof",
    "candidate file has slug plus provenance hashes to verified proof and approval board"
  ],
  requiredFuturePlannerAssertions: {
    noFamilyClaimWithoutPerSlugRouteEvidence: true,
    cooccurrenceDiagnosticsExcludedFromFamilyAttribution: true,
    oldDiagnosticsNotDeletedBecauseAuditTrail: true,
    diagnosticsQuarantinedForAttribution: true
  },
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  }
};

policy.policySha256 = shaText(JSON.stringify(policy.ruleSet) + JSON.stringify(policy.bannedEvidencePatterns) + JSON.stringify(policy.allowedEvidencePatterns));

await fs.writeFile(outPath, `${JSON.stringify(policy, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  status: policy.status,
  output: policy.output,
  ruleSet: policy.ruleSet,
  guardrails: policy.guardrails
}, null, 2));
