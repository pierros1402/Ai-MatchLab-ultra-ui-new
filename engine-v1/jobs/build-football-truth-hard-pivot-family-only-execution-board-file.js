import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const outputDir = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `hard-pivot-family-only-execution-board-${today}`
);

const outputPath = path.join(outputDir, `hard-pivot-family-only-execution-board-${today}.json`);
const rowsOutputPath = path.join(outputDir, `hard-pivot-family-only-execution-board-rows-${today}.jsonl`);

const knownReusableFamilies = [
  {
    familyKey: "laliga_official",
    priority: 1,
    reason: "previously materialized / verified route family; deterministic official-route family, not generic discovery",
    slugs: ["esp.1", "esp.2"],
    lane: "reuse_existing_family_contract"
  },
  {
    familyKey: "bundesliga_dfb_rendered",
    priority: 1,
    reason: "browser-rendered official route already verified for Bundesliga / 2. Bundesliga / 3. Liga",
    slugs: ["ger.1", "ger.2", "ger.3"],
    lane: "reuse_existing_family_contract"
  },
  {
    familyKey: "spfl_official_rendered",
    priority: 1,
    reason: "SPFL rendered route family produced strong table/team signals for sco.1 and sco.2",
    slugs: ["sco.1", "sco.2"],
    lane: "reuse_existing_family_contract"
  },
  {
    familyKey: "norway_ntf",
    priority: 1,
    reason: "Norway NTF official family already produced verified canonical candidates for nor.1; avoid nor.2 until carryover/phase issue is governed",
    slugs: ["nor.1"],
    lane: "reuse_existing_family_contract"
  },
  {
    familyKey: "torneopal_veikkausliiga",
    priority: 2,
    reason: "known official/provider family candidate for Finland current/new season coverage",
    slugs: ["fin.1", "fin.2"],
    lane: "reuse_existing_family_contract"
  },
  {
    familyKey: "ksi_iceland",
    priority: 2,
    reason: "known association/provider family candidate for Iceland current/new season coverage",
    slugs: ["isl.1", "isl.2"],
    lane: "reuse_existing_family_contract"
  },
  {
    familyKey: "sportomedia_sef",
    priority: 2,
    reason: "known official/provider family candidate for Sweden/SEF; use only family contract, not generic site probing",
    slugs: ["swe.1", "swe.2"],
    lane: "reuse_existing_family_contract"
  },
  {
    familyKey: "loi_ajax",
    priority: 2,
    reason: "known executable/provider family candidate; only continue if family contract proves multi-slug reuse",
    slugs: ["irl.1"],
    lane: "reuse_existing_family_contract"
  },
  {
    familyKey: "cfa_cyprus_html",
    priority: 3,
    reason: "known HTML family but cyp.2 blocked by phase/carryover/youth false positives; use only governed parser",
    slugs: ["cyp.1"],
    lane: "reuse_existing_family_contract"
  }
];

const failedGenericLaneArtifacts = [
  {
    artifact: `official-host-extraction-validation-${today}`,
    conclusion: "Official host/proof/extraction lane passed only aut.2 despite hand-supplied official routes and targets. This lane is not viable as the primary bulk strategy."
  },
  {
    artifact: `official-host-proof-inspection-${today}`,
    conclusion: "Proof inspection produced extraction candidates, but most failed strict validation; generic parsing does not scale across official sites."
  },
  {
    artifact: `official-host-proof-target-board-${today}`,
    conclusion: "Proof target board reduced noise but still required hand-curated routes and produced low validated yield."
  },
  {
    artifact: `direct-official-host-route-probe-review-board-${today}`,
    conclusion: "Direct official-host probing was better than search/RSS but still too noisy/low-yield for universal automation."
  }
];

const stopRules = [
  "Do not run more search-engine/RSS batches for standings route discovery.",
  "Do not run generic official-host probing as a primary lane.",
  "Do not build an AI crawler expecting universal official-site extraction.",
  "Do not spend more time on one-league repairs unless the repair becomes a reusable family contract.",
  "Do not canonical-write or truth-assert from diagnostic rows without explicit approval and all validation gates."
];

const nextExecutionRules = [
  "Only execute deterministic reusable source families with explicit family contracts.",
  "A lane is worth continuing only if it covers multiple slugs or a top-tier slug with verified row extraction.",
  "Every family execution must preserve lane, seasonScope, seasonLabel, expected row count, team signals, W/D/L arithmetic, points arithmetic, GD arithmetic, duplicate guard, and non-trivial gate.",
  "Leagues outside reusable families should be classified as source-acquisition/provider-needed, not endlessly scraped."
];

await fs.mkdir(outputDir, { recursive: true });

const rows = knownReusableFamilies.map(row => ({
  ...row,
  acceptedNow: false,
  acceptanceAllowedNow: false,
  reviewOnly: true,
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0
}));

const report = {
  status: "passed",
  runner: "hard_pivot_family_only_execution_board",
  contractVersion: 1,
  purpose: "Hard project pivot away from generic AI/site crawling after low-yield official-host extraction validation. Defines family-only execution policy.",
  output: path.relative(root, outputPath).replaceAll("\\", "/"),
  rowsOutput: path.relative(root, rowsOutputPath).replaceAll("\\", "/"),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  decision: {
    genericOfficialCrawlerViableAsPrimaryStrategy: false,
    reason: "Even with hand-supplied official hosts/routes/scripts/APIs, strict extraction validation produced only one validated slug. A generic AI crawler would be slower and less reliable, not faster.",
    primaryStrategyFromNow: "family_only_deterministic_source_contracts",
    stopRules,
    nextExecutionRules
  },
  failedGenericLaneArtifacts,
  summary: {
    reusableFamilyCount: rows.length,
    targetSlugCountFromKnownFamilies: new Set(rows.flatMap(row => row.slugs)).size,
    firstExecutionFamilyOrder: rows.sort((a, b) => a.priority - b.priority).map(row => row.familyKey),
    acceptedNowCount: 0
  },
  rows
};

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsOutputPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  decision: report.decision,
  summary: report.summary
}, null, 2));
