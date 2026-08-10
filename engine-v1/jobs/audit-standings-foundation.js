import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDataPath } from "../storage/data-root.js";
import {
  readHistoryRows,
  validateStandingsFoundationArtifact,
} from "../core/standings-foundation.js";

const __filename = fileURLToPath(import.meta.url);

export function auditStandingsFoundation({ season = "2026-2027" } = {}) {
  const dir = resolveDataPath("standings");
  const historyRows = readHistoryRows(season);
  const files = fs.readdirSync(dir)
    .filter(name => name.endsWith(".json"))
    .sort();

  const results = [];
  for (const name of files) {
    const slug = name.slice(0, -5);
    const filePath = path.join(dir, name);
    let artifact;
    try {
      artifact = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
      results.push({ slug, status: "INVALID_JSON", ok: false, issues: [error.message] });
      continue;
    }

    const foundationStatus = artifact?.foundation?.status || "MISSING";
    if (foundationStatus === "PASS") {
      const validation = validateStandingsFoundationArtifact(artifact, {
        slug,
        historyRows,
      });
      results.push({
        slug,
        status: validation.ok ? "PASS" : "INVALID_PASS",
        ok: validation.ok,
        consumerRows: Array.isArray(artifact.table) ? artifact.table.length : 0,
        observedRows: artifact?.foundation?.observedRowCount || 0,
        issues: validation.issues,
      });
      continue;
    }

    const issues = [];
    if (foundationStatus !== "GATED") issues.push("FOUNDATION_STATUS_NOT_GATED");
    if (!Array.isArray(artifact?.table) || artifact.table.length !== 0) {
      issues.push("GATED_CONSUMER_TABLE_MUST_BE_EMPTY");
    }
    if (Number(artifact?.confidence) !== 0) issues.push("GATED_CONFIDENCE_MUST_BE_ZERO");
    if (artifact?.foundation?.usable !== false) issues.push("GATED_USABLE_MUST_BE_FALSE");
    if (!Array.isArray(artifact?.foundation?.reasonCodes) || artifact.foundation.reasonCodes.length === 0) {
      issues.push("GATED_REASON_REQUIRED");
    }
    if (!Array.isArray(artifact?.foundation?.observedTable)) {
      issues.push("GATED_OBSERVED_EVIDENCE_REQUIRED");
    }

    results.push({
      slug,
      status: issues.length ? "INVALID_GATED" : "GATED",
      ok: issues.length === 0,
      consumerRows: Array.isArray(artifact?.table) ? artifact.table.length : 0,
      observedRows: artifact?.foundation?.observedRowCount || 0,
      issues,
      reasonCodes: artifact?.foundation?.reasonCodes || [],
      contractStatus: artifact?.foundation?.contractValidation?.status || null,
    });
  }

  const summary = {
    artifacts: results.length,
    pass: results.filter(item => item.status === "PASS").length,
    gated: results.filter(item => item.status === "GATED").length,
    invalid: results.filter(item => !item.ok).length,
    unsafeGatedConsumerTables: results.filter(item => item.status !== "PASS" && item.consumerRows > 0).length,
  };

  return {
    schema: "ai-matchlab.standings-foundation-audit.v1",
    generatedAt: new Date().toISOString(),
    ok: summary.invalid === 0 && summary.unsafeGatedConsumerTables === 0,
    season,
    summary,
    passSlugs: results.filter(item => item.status === "PASS").map(item => item.slug),
    results,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const report = auditStandingsFoundation();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 2;
}
