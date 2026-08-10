import fs from "node:fs";
import path from "node:path";

import { resolveDataPath } from "../storage/data-root.js";
import { createProductionEvidenceIdentityOverlay } from "../core/production-evidence-identity-overlay.js";
import { canonicalH2HTeamIdentity } from "../core/h2h-canonical-key-policy.js";
import { auditHistoryRows } from "./audit-history-semantic-integrity.js";

const HISTORY_FILES = ["2025-2026.json", "2026-2027.json"];

function clean(value) {
  return String(value ?? "").trim();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function teamReference(row, side) {
  const key = side === "home" ? "home" : "away";
  const title = side === "home" ? "Home" : "Away";
  return {
    globalClubId:
      clean(row?.[`${key}GlobalClubId`] || row?.[`${key}TeamGlobalClubId`] || row?.productionIdentityBinding?.[`${key}GlobalClubId`] || row?.teams?.[key]?.globalClubId) || undefined,
    ledgerTeamIdentityKey:
      clean(row?.[`${key}LedgerTeamIdentityKey`] || row?.[`${key}TeamIdentityKey`] || row?.teams?.[key]?.ledgerTeamIdentityKey) || undefined,
    alias:
      clean(row?.[`${key}Team`] || row?.[key] || row?.[`${key}Name`] || row?.teams?.[key]?.name || row?.[`${title}Team`]) || undefined,
    leagueSlug: clean(row?.leagueSlug) || undefined,
  };
}

function canonicalizedHistoryView(row, overlay, overlayFailures) {
  const overlaid = overlay.overlayEvidenceMatchRow(row);
  if (!overlaid?.ok) {
    let homeResolution = null;
    let awayResolution = null;
    try {
      homeResolution = overlay.overlayEvidenceTeamIdentity(teamReference(row, "home"));
    } catch (error) {
      homeResolution = { ok: false, status: error?.code || error?.message || "home_resolution_exception" };
    }
    try {
      awayResolution = overlay.overlayEvidenceTeamIdentity(teamReference(row, "away"));
    } catch (error) {
      awayResolution = { ok: false, status: error?.code || error?.message || "away_resolution_exception" };
    }

    overlayFailures.push({
      id: clean(row?.id || row?.matchId || row?.canonicalId),
      dayKey: clean(row?.dayKey),
      leagueSlug: clean(row?.leagueSlug),
      homeTeam: clean(row?.homeTeam),
      awayTeam: clean(row?.awayTeam),
      scoreHome: row?.scoreHome ?? null,
      scoreAway: row?.scoreAway ?? null,
      status: clean(row?.status),
      source: clean(row?.source),
      overlayStatus: overlaid?.status || "unknown",
      fixtureResolution: overlaid?.fixtureResolution || null,
      homeResolution,
      awayResolution,
    });
    return null;
  }

  const home = canonicalH2HTeamIdentity(overlaid.homeResolution.preferredDisplayName);
  const away = canonicalH2HTeamIdentity(overlaid.awayResolution.preferredDisplayName);
  if (!home.valid || !away.valid) {
    overlayFailures.push({
      id: clean(row?.id || row?.matchId || row?.canonicalId),
      dayKey: clean(row?.dayKey),
      leagueSlug: clean(row?.leagueSlug),
      homeTeam: clean(row?.homeTeam),
      awayTeam: clean(row?.awayTeam),
      overlayStatus: "H2H_TEAM_IDENTITY_INVALID",
      homeResolution: overlaid.homeResolution,
      awayResolution: overlaid.awayResolution,
    });
    return null;
  }

  return {
    ...clone(row),
    homeTeam: home.canonicalName || overlaid.homeResolution.preferredDisplayName,
    awayTeam: away.canonicalName || overlaid.awayResolution.preferredDisplayName,
  };
}

const historyRoot = resolveDataPath("history");
const overlay = createProductionEvidenceIdentityOverlay();
const transformed = [];
const rawRows = [];
const documents = [];
const overlayFailures = [];

for (const name of HISTORY_FILES) {
  const filePath = path.join(historyRoot, name);
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  let rowCount = 0;
  let acceptedCount = 0;
  for (const day of payload?.days || []) {
    for (const row of day?.rows || []) {
      rawRows.push({ ...clone(row), __container: name });
      const transformedRow = canonicalizedHistoryView(row, overlay, overlayFailures);
      if (transformedRow) {
        transformed.push({ ...transformedRow, __container: name });
        acceptedCount += 1;
      }
      rowCount += 1;
    }
  }
  documents.push({ name, filePath, days: payload?.days?.length || 0, rows: rowCount, acceptedRows: acceptedCount });
}

const rawAudit = auditHistoryRows(rawRows, { maxExamples: 10000 });
const audit = auditHistoryRows(transformed, { maxExamples: 10000 });
const result = {
  schema: "ai-matchlab.foundation-shadow-current-history-audit.v2",
  generatedAt: new Date().toISOString(),
  sourceRows: rawRows.length,
  transformedRows: transformed.length,
  overlayFailureCount: overlayFailures.length,
  overlayFailures,
  documents,
  rawPrecondition: {
    invalidRowCount: rawAudit.invalidRowCount,
    duplicateIdCount: rawAudit.duplicateIdCount,
    operationalDayMismatchCount: rawAudit.operationalDayMismatchCount,
    duplicateGroups: rawAudit.semantic.duplicateGroups,
    scoreConflictGroups: rawAudit.semantic.scoreConflictGroups,
    flippedOrientationGroups: rawAudit.semantic.flippedOrientationGroups,
    crossOperationalDayGroups: rawAudit.semantic.crossOperationalDayGroups,
  },
  transformedPrecondition: {
    invalidRowCount: audit.invalidRowCount,
    duplicateIdCount: audit.duplicateIdCount,
    operationalDayMismatchCount: audit.operationalDayMismatchCount,
    duplicateGroups: audit.semantic.duplicateGroups,
    scoreConflictGroups: audit.semantic.scoreConflictGroups,
    flippedOrientationGroups: audit.semantic.flippedOrientationGroups,
    crossOperationalDayGroups: audit.semantic.crossOperationalDayGroups,
    safeForAliasRepair:
      overlayFailures.length === 0 &&
      audit.invalidRowCount === 0 &&
      audit.duplicateIdCount === 0 &&
      audit.operationalDayMismatchCount === 0 &&
      audit.semantic.scoreConflictGroups === 0 &&
      audit.semantic.flippedOrientationGroups === 0 &&
      audit.semantic.crossOperationalDayGroups === 0,
  },
  rawAudit,
  transformedAudit: audit,
};

fs.mkdirSync(resolveDataPath("history-integrity", "shadow"), { recursive: true });
const output = resolveDataPath("history-integrity", "shadow", "current-history-audit.json");
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  overlayFailureCount: result.overlayFailureCount,
  rawPrecondition: result.rawPrecondition,
  transformedPrecondition: result.transformedPrecondition,
}));
console.log(`SHADOW_AUDIT_PATH=${output}`);
