import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const inventoryPath = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `strict-existing-family-contract-inventory-${today}`,
  `strict-existing-family-contract-inventory-${today}.json`
);

const outputDir = path.join(root, "data", "football-truth", "_diagnostics", `anchored-family-coverage-board-${today}`);
const outputPath = path.join(outputDir, `anchored-family-coverage-board-${today}.json`);
const rowsOutputPath = path.join(outputDir, `anchored-family-coverage-board-rows-${today}.jsonl`);

const knownLifecycle = {
  previousCompletedSatisfiedSlugs: [
    "esp.1", "esp.2",
    "ger.1", "ger.2", "ger.3",
    "cro.1",
    "sco.1", "sco.2",
    "ned.1",
    "den.1",
    "jpn.1",
    "eng.1"
  ],
  currentOrNewSatisfiedSlugs: [
    "geo.1",
    "cyp.1",
    "fin.1", "fin.2",
    "isl.1", "isl.2",
    "nor.1",
    "swe.1", "swe.2"
  ],
  nextSeasonStartDateSatisfiedSlugs: [
    "eng.1",
    "ksa.1"
  ],
  blockedOrReviewOnlySlugs: [
    "ita.1",
    "nor.2",
    "cyp.2"
  ],
  validatedButNotLifecyclePromotedSlugs: [
    "aut.2"
  ]
};

const familyScopeNotes = {
  laliga_official: "Already previous_completed satisfied for esp.1/esp.2.",
  bundesliga_dfb_rendered: "Already previous_completed satisfied for ger.1/ger.2/ger.3.",
  spfl_official_rendered: "Already previous_completed satisfied for sco.1/sco.2.",
  norway_ntf: "nor.1 already has previous_completed and current/new coverage; nor.2 remains blocked outside this family row.",
  sportomedia_sef: "swe.1/swe.2 are current/new satisfied, not previous_completed satisfied in lifecycle.",
  torneopal_veikkausliiga: "fin.1/fin.2 are current/new satisfied, not previous_completed satisfied in lifecycle.",
  ksi_iceland: "isl.1/isl.2 are current/new satisfied, not previous_completed satisfied in lifecycle.",
  cfa_cyprus_html: "cyp.1 is current/new satisfied; cyp.2 remains blocked outside this family row.",
  loi_ajax: "Family-specific assets exist but no lifecycle coverage and verifier missing."
};

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function intersect(slugs, known) {
  const set = new Set(known);
  return slugs.filter(slug => set.has(slug));
}

function diff(slugs, known) {
  const set = new Set(known);
  return slugs.filter(slug => !set.has(slug));
}

await fs.mkdir(outputDir, { recursive: true });

const inventory = JSON.parse(await fs.readFile(inventoryPath, "utf8"));
const rows = [];

for (const invRow of inventory.rows || []) {
  const slugs = invRow.slugs || [];

  const previousCompletedSatisfiedSlugs = intersect(slugs, knownLifecycle.previousCompletedSatisfiedSlugs);
  const currentOrNewSatisfiedSlugs = intersect(slugs, knownLifecycle.currentOrNewSatisfiedSlugs);
  const nextSeasonStartDateSatisfiedSlugs = intersect(slugs, knownLifecycle.nextSeasonStartDateSatisfiedSlugs);
  const blockedOrReviewOnlySlugs = intersect(slugs, knownLifecycle.blockedOrReviewOnlySlugs);
  const validatedButNotLifecyclePromotedSlugs = intersect(slugs, knownLifecycle.validatedButNotLifecyclePromotedSlugs);

  const previousCompletedMissingSlugs = diff(slugs, knownLifecycle.previousCompletedSatisfiedSlugs);
  const currentOrNewMissingSlugs = diff(slugs, knownLifecycle.currentOrNewSatisfiedSlugs);

  let actualCoverageTier = "no_lifecycle_coverage";
  let nextAction = "do_not_execute_until_family_contract_has_specific_goal";

  if (previousCompletedSatisfiedSlugs.length === slugs.length && slugs.length > 0) {
    actualCoverageTier = "previous_completed_family_satisfied";
    nextAction = "no_bulk_execution_needed_for_previous_completed; use only refresh/maintenance";
  } else if (previousCompletedSatisfiedSlugs.length > 0) {
    actualCoverageTier = "partial_previous_completed_family";
    nextAction = "only extend missing slugs if same family contract can prove them";
  } else if (currentOrNewSatisfiedSlugs.length === slugs.length && slugs.length > 0) {
    actualCoverageTier = "current_or_new_only_family_satisfied";
    nextAction = "previous_completed still missing; only continue if family has deterministic previous-season endpoint";
  } else if (currentOrNewSatisfiedSlugs.length > 0) {
    actualCoverageTier = "partial_current_or_new_family";
    nextAction = "separate current/new coverage from previous_completed backlog";
  }

  rows.push({
    familyKey: invRow.familyKey,
    slugs,
    readiness: invRow.readiness,
    executableRunnerMatchCount: invRow.executableRunnerMatchCount,
    verifierMatchCount: invRow.verifierMatchCount,
    actualCoverageTier,
    previousCompletedSatisfiedSlugs,
    previousCompletedMissingSlugs,
    currentOrNewSatisfiedSlugs,
    currentOrNewMissingSlugs,
    nextSeasonStartDateSatisfiedSlugs,
    blockedOrReviewOnlySlugs,
    validatedButNotLifecyclePromotedSlugs,
    scopeNote: familyScopeNotes[invRow.familyKey] || "",
    nextAction,
    topExecutionFiles: (invRow.topFiles || []).slice(0, 8).map(file => file.rel),
    acceptedNow: false,
    acceptanceAllowedNow: false,
    reviewOnly: true
  });
}

const tierOrder = {
  previous_completed_family_satisfied: 1,
  partial_previous_completed_family: 2,
  current_or_new_only_family_satisfied: 3,
  partial_current_or_new_family: 4,
  no_lifecycle_coverage: 5
};

rows.sort((a, b) =>
  tierOrder[a.actualCoverageTier] - tierOrder[b.actualCoverageTier] ||
  b.previousCompletedSatisfiedSlugs.length - a.previousCompletedSatisfiedSlugs.length ||
  b.currentOrNewSatisfiedSlugs.length - a.currentOrNewSatisfiedSlugs.length ||
  a.familyKey.localeCompare(b.familyKey)
);

const report = {
  status: "passed",
  runner: "anchored_family_coverage_board",
  contractVersion: 1,
  purpose: "Anchor family execution inventory to known lifecycle-satisfied coverage. Does not infer coverage from fuzzy artifact hits or runner existence.",
  inputInventoryPath: path.relative(root, inventoryPath).replaceAll("\\", "/"),
  inputInventorySha256: await sha256(inventoryPath),
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
  knownLifecycle,
  summary: {
    familyCount: rows.length,
    previousCompletedFamilySatisfiedCount: rows.filter(row => row.actualCoverageTier === "previous_completed_family_satisfied").length,
    currentOrNewOnlyFamilySatisfiedCount: rows.filter(row => row.actualCoverageTier === "current_or_new_only_family_satisfied").length,
    noLifecycleCoverageFamilyCount: rows.filter(row => row.actualCoverageTier === "no_lifecycle_coverage").length,
    previousCompletedSatisfiedFamilySlugCount: new Set(rows.flatMap(row => row.previousCompletedSatisfiedSlugs)).size,
    currentOrNewSatisfiedFamilySlugCount: new Set(rows.flatMap(row => row.currentOrNewSatisfiedSlugs)).size,
    validatedButNotLifecyclePromotedFamilySlugCount: new Set(rows.flatMap(row => row.validatedButNotLifecyclePromotedSlugs)).size,
    familyRows: rows.map(row => ({
      familyKey: row.familyKey,
      slugs: row.slugs,
      actualCoverageTier: row.actualCoverageTier,
      previousCompletedSatisfiedSlugs: row.previousCompletedSatisfiedSlugs,
      currentOrNewSatisfiedSlugs: row.currentOrNewSatisfiedSlugs,
      nextAction: row.nextAction
    })),
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
  summary: report.summary
}, null, 2));
