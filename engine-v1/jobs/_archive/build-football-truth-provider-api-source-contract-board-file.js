import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const configPath = path.join(root, "engine-v1", "config", "football-truth-provider-api-source-contracts.json");
const outputDir = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-source-contract-board-${today}`);
const outputPath = path.join(outputDir, `provider-api-source-contract-board-${today}.json`);
const rowsOutputPath = path.join(outputDir, `provider-api-source-contract-board-rows-${today}.jsonl`);

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

await fs.mkdir(outputDir, { recursive: true });

const config = JSON.parse(await fs.readFile(configPath, "utf8"));
const blocks = [];

if (config.globalPolicy?.providerTruthWithoutValidationAllowed !== false) blocks.push("provider_truth_without_validation_not_false");
if (config.globalPolicy?.canonicalWriteAllowedByThisConfig !== false) blocks.push("canonical_write_allowed_by_config");
if (config.globalPolicy?.truthAssertionAllowedByThisConfig !== false) blocks.push("truth_assertion_allowed_by_config");

const rows = [];

for (const target of config.initialMappingTargets || []) {
  for (const provider of config.providerFamilies || []) {
    const envVar = provider.auth?.envVar || "";
    rows.push({
      slug: target.slug,
      league: target.league,
      country: target.country,
      providerFamily: provider.providerFamily,
      providerLeagueId: null,
      providerSeasonParam: null,
      seasonScope: target.seasonScope,
      seasonLabel: target.seasonLabel,
      expectedRows: target.expectedRows,
      teamSignalTerms: target.teamSignalTerms,
      endpointTemplate: provider.endpoints?.standings,
      authEnvVar: envVar,
      envKeyPresentNow: Boolean(process.env[envVar]),
      rowMapping: provider.rowMapping,
      authorityPolicy: provider.authorityPolicy,
      licensePolicy: provider.licensePolicy,
      mappingStatus: "needs_provider_league_id_mapping",
      proofStatus: "not_executed",
      purpose: target.purpose,
      acceptedNow: false,
      acceptanceAllowedNow: false,
      reviewOnly: true
    });
  }
}

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "provider_api_source_contract_board",
  contractVersion: 1,
  purpose: "Build provider API source contract and league-id mapping board. No provider fetch is executed.",
  configPath: path.relative(root, configPath).replaceAll("\\", "/"),
  configSha256: await sha256(configPath),
  output: path.relative(root, outputPath).replaceAll("\\", "/"),
  rowsOutput: path.relative(root, rowsOutputPath).replaceAll("\\", "/"),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    providerFetchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  providerPolicies: config.providerFamilies.map(provider => ({
    providerFamily: provider.providerFamily,
    auth: provider.auth,
    rateLimitPolicy: provider.rateLimitPolicy,
    authorityPolicy: provider.authorityPolicy,
    licensePolicy: provider.licensePolicy
  })),
  summary: {
    providerFamilyCount: config.providerFamilies.length,
    initialMappingTargetCount: config.initialMappingTargets.length,
    mappingBoardRowCount: rows.length,
    envKeyPresentCount: rows.filter(row => row.envKeyPresentNow).length,
    apiFootballRows: rows.filter(row => row.providerFamily === "api_football").length,
    theSportsDbRows: rows.filter(row => row.providerFamily === "thesportsdb").length,
    mappingNeededCount: rows.filter(row => row.mappingStatus === "needs_provider_league_id_mapping").length,
    recommendedNextLane: "build mapping discovery/import board; execute provider fetch only after explicit API key and allow-fetch approval",
    acceptedNowCount: 0
  },
  blocks,
  rows
};

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsOutputPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary,
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
