import fs from "fs";
import path from "path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "url";

import {
  buildCompetitionFormatRegistryIndex,
  registryAuthoritySummary,
  resolveCompetitionFormatContract,
  validateCompetitionFormatRegistry
} from "./competition-format-registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const registryPath = path.resolve(__dirname, "..", "..", "data", "competition-format-registry", "registry.v1.json");

function loadRegistry() {
  return JSON.parse(fs.readFileSync(registryPath, "utf8"));
}

test("production registry schema validates and coverage is internally exact", () => {
  const registry = loadRegistry();
  const validation = validateCompetitionFormatRegistry(registry);
  assert.equal(validation.ok, true, JSON.stringify(validation.issues, null, 2));
  assert.equal(validation.contractCount, 177);
  assert.equal(validation.errorCount, 0);

  const summary = registryAuthoritySummary(registry);
  assert.deepEqual(
    {
      contracts: summary.contracts,
      enabled: summary.enabled,
      teamCountAuthority: summary.teamCountAuthority,
      phaseAuthority: summary.phaseAuthority,
      unverified: summary.unverified
    },
    {
      contracts: 177,
      enabled: 172,
      teamCountAuthority: 8,
      phaseAuthority: 0,
      unverified: 169
    }
  );
});

test("contract resolver selects exact league and season", () => {
  const registry = loadRegistry();
  const index = buildCompetitionFormatRegistryIndex(registry);
  const contract = resolveCompetitionFormatContract(index, "bol.1", "2026");
  assert.equal(contract.contractId, "bol.1@2026#v1");
  assert.deepEqual(contract.authority.scopes, ["TEAM_COUNT"]);
  assert.equal(contract.teamCount.rule.value, 16);
  assert.equal(resolveCompetitionFormatContract(index, "bol.1", "1900"), null);
});

test("duplicate contract IDs fail registry validation", () => {
  const registry = loadRegistry();
  registry.contracts.push(structuredClone(registry.contracts[0]));
  registry.coverage.contractCount += 1;
  if (registry.contracts.at(-1).competition.enabled) registry.coverage.enabledContractCount += 1;
  else registry.coverage.disabledContractCount += 1;
  if (["UNVERIFIED", "NO_BASELINE"].includes(registry.contracts.at(-1).authority.status)) {
    registry.coverage.unverifiedContractCount += 1;
  }

  const validation = validateCompetitionFormatRegistry(registry);
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some(item => item.code === "CONTRACT_ID_DUPLICATE"));
  assert.ok(validation.issues.some(item => item.code === "CONTRACT_KEY_DUPLICATE"));
});

test("strict team-count enforcement is forbidden without authority", () => {
  const registry = loadRegistry();
  const contract = registry.contracts.find(item => item.authority.status === "UNVERIFIED");
  contract.teamCount.enforcement = "STRICT_REPORT_ONLY";
  const validation = validateCompetitionFormatRegistry(registry);
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some(item => item.code === "TEAM_COUNT_STRICT_WITHOUT_AUTHORITY"));
});

test("TEAM_COUNT authority requires primary official or regulation evidence", () => {
  const registry = loadRegistry();
  const contract = registry.contracts.find(item => item.competition.slug === "col.1");
  contract.authority.evidence = contract.authority.evidence.map(item => ({
    ...item,
    sourceClass: "TRUSTED_SECONDARY"
  }));

  const validation = validateCompetitionFormatRegistry(registry);
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some(item => item.code === "TEAM_COUNT_PRIMARY_EVIDENCE_REQUIRED"));
});
