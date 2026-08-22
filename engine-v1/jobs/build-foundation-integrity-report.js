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

function finiteScore(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function scoreConsistentMultiSideAliasMirror(example) {
  const sides = Array.isArray(example?.sides) ? example.sides : [];
  if (sides.length < 3) return false;

  const homes = sides.filter(side => side?.ha === "H");
  const aways = sides.filter(side => side?.ha === "A");
  if (!homes.length || !aways.length) return false;

  const firstHome = homes[0];
  const firstAway = aways[0];
  const homeGf = finiteScore(firstHome?.gf);
  const homeGa = finiteScore(firstHome?.ga);
  const awayGf = finiteScore(firstAway?.gf);
  const awayGa = finiteScore(firstAway?.ga);
  if ([homeGf, homeGa, awayGf, awayGa].some(value => value === null)) return false;

  const homesAgree = homes.every(side => (
    finiteScore(side?.gf) === homeGf
    && finiteScore(side?.ga) === homeGa
  ));
  const awaysAgree = aways.every(side => (
    finiteScore(side?.gf) === awayGf
    && finiteScore(side?.ga) === awayGa
  ));

  return homesAgree
    && awaysAgree
    && homeGf === awayGa
    && homeGa === awayGf;
}

function historyPublicationSafety(history) {
  const issues = Array.isArray(history?.issues) ? history.issues : [];
  const errorIssues = issues.filter(issue => issue?.severity === "error");
  const errorTypeCount = Number(history?.issueCounts?.error || 0);

  if (errorTypeCount === 0 && history?.ok === true) {
    return {
      ok: true,
      reason: null,
      errorTypeCount: 0,
      scoreConsistentAliasMirrorConflictCount: 0,
    };
  }

  // Fail closed if the aggregate says errors exist but the report does not expose
  // the exact error rows needed to classify them safely.
  if (!errorIssues.length) {
    return {
      ok: false,
      reason: "history_semantic_errors_unclassified",
      errorTypeCount,
      scoreConsistentAliasMirrorConflictCount: 0,
    };
  }

  const nonAliasMirrorErrors = errorIssues.filter(issue => issue?.type !== "results_mirror_conflicts");
  if (nonAliasMirrorErrors.length) {
    return {
      ok: false,
      reason: "history_semantic_errors_present",
      errorTypeCount,
      scoreConsistentAliasMirrorConflictCount: 0,
    };
  }

  const declaredMirrorConflictCount = errorIssues
    .filter(issue => issue?.type === "results_mirror_conflicts")
    .reduce((sum, issue) => sum + Math.max(0, Number(issue?.count || 0)), 0);

  const mirrorExamples = (Array.isArray(history?.resultsMemory?.affectedLeagues)
    ? history.resultsMemory.affectedLeagues
    : [])
    .flatMap(row => Array.isArray(row?.examples?.mirrorConflicts) ? row.examples.mirrorConflicts : []);

  const safeMirrorConflictCount = mirrorExamples
    .filter(scoreConsistentMultiSideAliasMirror)
    .length;

  const allDeclaredMirrorConflictsProvenSafe = declaredMirrorConflictCount > 0
    && safeMirrorConflictCount === declaredMirrorConflictCount;

  return {
    ok: allDeclaredMirrorConflictsProvenSafe,
    reason: allDeclaredMirrorConflictsProvenSafe
      ? null
      : "history_semantic_errors_present",
    errorTypeCount,
    scoreConsistentAliasMirrorConflictCount: safeMirrorConflictCount,
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
  const historySafety = historyPublicationSafety(history);
  const historyDetail = history && typeof history === "object"
    ? { ...history, publicationSafety: historySafety }
    : { publicationSafety: historySafety };

  const components = {
    historySemantic: component(
      historySafety.ok === true,
      historyDetail,
      historySafety.reason || "history_semantic_errors_present"
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
  const expiredResults = Number(history?.resultsMemory?.expiredEntryCount || 0);
  if (expiredResults > 0) {
    warnings.push({
      component: "historySemantic",
      reason: "age_expired_results_rows_present",
      count: expiredResults,
      informational: true,
    });
  }

  const historyWarningTypes = Number(history?.issueCounts?.warning || 0);
  if (historySafety.ok === true && historyWarningTypes > 0) {
    warnings.push({
      component: "historySemantic",
      reason: "history_semantic_warnings_present",
      count: historyWarningTypes,
      informational: true,
    });
  }

  if (historySafety.scoreConsistentAliasMirrorConflictCount > 0) {
    warnings.push({
      component: "historySemantic",
      reason: "score_consistent_alias_mirror_conflicts_present",
      count: historySafety.scoreConsistentAliasMirrorConflictCount,
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
      historySemanticMustBePublicationSafe: true,
      historyWarningsBlockPublication: false,
      scoreConsistentAliasMirrorConflictsAreDiagnostic: true,
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
