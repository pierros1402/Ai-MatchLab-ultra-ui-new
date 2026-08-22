import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { currentSeason } from "../core/season.js";
import { buildSemanticHistoryAudit } from "./audit-history-semantic-integrity.js";
import { auditStandingsFoundation } from "./audit-standings-foundation.js";
import {
  validateHistoryIndexFoundationSync,
  validateModelPriorsFoundationSync,
  validateH2HFoundationSync,
} from "../core/derived-history-foundation.js";
import { auditDetailsFoundationDay } from "./audit-details-foundation-day.js";

function seasonForDay(dayKey) {
  const [year, month, day] = String(dayKey || "").split("-").map(Number);
  if (!year || !month || !day) return null;
  return currentSeason(new Date(Date.UTC(year, month - 1, day)));
}

function component(ok, detail, reason = null) {
  return {
    ok: ok === true,
    reason: ok === true ? null : reason || detail?.reason || "foundation_component_not_ready",
    detail,
  };
}

export function buildFoundationIntegrityReport(dayKey, options = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(dayKey || ""))) {
    throw new Error("invalid_day_key");
  }

  const season = options.season || seasonForDay(dayKey);
  const auditHistory = options.buildSemanticHistoryAudit || buildSemanticHistoryAudit;
  const auditStandings = options.auditStandingsFoundation || auditStandingsFoundation;
  const validateIndex = options.validateHistoryIndexFoundationSync || validateHistoryIndexFoundationSync;
  const validatePriors = options.validateModelPriorsFoundationSync || validateModelPriorsFoundationSync;
  const validateH2H = options.validateH2HFoundationSync || validateH2HFoundationSync;
  const auditDetails = options.auditDetailsFoundationDay || auditDetailsFoundationDay;

  const history = auditHistory();
  const standings = auditStandings({ season });
  const historyIndex = validateIndex(season);
  const modelPriors = validatePriors(season);
  const h2h = validateH2H();
  const details = auditDetails(dayKey);

  const components = {
    historySemantic: component(
      history?.ok === true,
      history,
      "history_semantic_errors_present"
    ),
    standings: component(standings?.ok === true, standings, "standings_foundation_not_ready"),
    historyIndex: component(historyIndex?.ok === true, historyIndex, "history_index_foundation_stale"),
    modelPriors: component(modelPriors?.ok === true, modelPriors, "model_priors_foundation_stale"),
    h2h: component(h2h?.ok === true, h2h, "h2h_foundation_stale"),
    details: component(details?.ok === true, details, "details_foundation_not_ready"),
  };

  const blocked = Object.entries(components)
    .filter(([, value]) => value.ok !== true)
    .map(([name, value]) => ({ component: name, reason: value.reason }));

  const warnings = [];
  const semanticWarningCount = Number(history?.issueCounts?.warning || 0);
  if (semanticWarningCount > 0) {
    warnings.push({
      component: "historySemantic",
      reason: "history_semantic_warnings_present",
      count: semanticWarningCount,
      informational: true,
    });
  }

  const expiredResults = Number(history?.resultsMemory?.expiredEntryCount || 0);
  if (expiredResults > 0) {
    warnings.push({
      component: "historySemantic",
      reason: "age_expired_results_rows_present",
      count: expiredResults,
      informational: true,
    });
  }

  const modelReady = ["historySemantic", "standings", "historyIndex", "modelPriors", "h2h"]
    .every(name => components[name].ok === true);
  const publicationReady = modelReady && components.details.ok === true;

  return {
    schema: "ai-matchlab.foundation-integrity.v1",
    generatedAt: new Date().toISOString(),
    dayKey,
    season,
    ok: publicationReady,
    modelReady,
    publicationReady,
    blocked,
    warnings,
    components,
    sourceContract: {
      historySemanticErrorsBlock: true,
        historySemanticWarningsInformational: true,
        historySemanticMustBeClean: false,
      standingsGatedArtifactsAllowedWhenSafe: true,
      staleDerivedArtifactsRejected: true,
      detailsMustMatchCurrentFoundation: true,
      deploySnapshotUsedAsTruth: false,
    },
  };
}

export function writeFoundationIntegrityReport(dayKey, options = {}) {
  const report = buildFoundationIntegrityReport(dayKey, options);
  const outDir = ensureDir(resolveDataPath("foundation-integrity"));
  fs.writeFileSync(path.join(outDir, `${dayKey}.json`), JSON.stringify(report, null, 2) + "\n", "utf8");
  fs.writeFileSync(path.join(outDir, "latest.json"), JSON.stringify({ ...report, latestForDay: dayKey }, null, 2) + "\n", "utf8");
  return report;
}

export function foundationIntegrityCliSummary(report) {
  const detailsComponent = report?.components?.details || null;
  const details = detailsComponent?.detail || null;
  return {
    dayKey: report?.dayKey || null,
    season: report?.season || null,
    modelReady: report?.modelReady === true,
    publicationReady: report?.publicationReady === true,
    blocked: Array.isArray(report?.blocked) ? report.blocked : [],
    warnings: Array.isArray(report?.warnings) ? report.warnings : [],
    details: {
      ok: details?.ok === true,
      reason: detailsComponent?.reason || null,
      summary: details?.summary || null,
      issues: Array.isArray(details?.issues) ? details.issues : [],
    },
  };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const dayKey = process.argv.find(arg => /^\d{4}-\d{2}-\d{2}$/u.test(arg))
    || process.argv.find(arg => arg.startsWith("--date="))?.slice(7);
  const gate = process.argv.includes("--gate");
  if (!dayKey) {
    console.error("Usage: node engine-v1/jobs/build-foundation-integrity-report.js --date=YYYY-MM-DD [--gate]");
    process.exit(1);
  }
  const report = writeFoundationIntegrityReport(dayKey);
  console.log(JSON.stringify(foundationIntegrityCliSummary(report), null, 2));
  if (gate && !report.publicationReady) process.exitCode = 1;
}
