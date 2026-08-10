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

function canonicalizedHistoryView(row, overlay) {
  const overlaid = overlay.overlayEvidenceMatchRow(row);
  if (!overlaid?.ok) {
    throw new Error(`shadow_history_identity_overlay_failed:${clean(row?.id)}:${overlaid?.status || "unknown"}`);
  }
  const home = canonicalH2HTeamIdentity(overlaid.homeResolution.preferredDisplayName);
  const away = canonicalH2HTeamIdentity(overlaid.awayResolution.preferredDisplayName);
  if (!home.valid || !away.valid) {
    throw new Error(`shadow_history_h2h_team_identity_invalid:${clean(row?.id)}`);
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
const documents = [];

for (const name of HISTORY_FILES) {
  const filePath = path.join(historyRoot, name);
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  let rowCount = 0;
  for (const day of payload?.days || []) {
    for (const row of day?.rows || []) {
      transformed.push({
        ...canonicalizedHistoryView(row, overlay),
        __container: name,
      });
      rowCount += 1;
    }
  }
  documents.push({ name, filePath, days: payload?.days?.length || 0, rows: rowCount });
}

const audit = auditHistoryRows(transformed, { maxExamples: 10000 });
const result = {
  schema: "ai-matchlab.foundation-shadow-current-history-audit.v1",
  generatedAt: new Date().toISOString(),
  sourceRows: transformed.length,
  documents,
  precondition: {
    invalidRowCount: audit.invalidRowCount,
    duplicateIdCount: audit.duplicateIdCount,
    operationalDayMismatchCount: audit.operationalDayMismatchCount,
    duplicateGroups: audit.semantic.duplicateGroups,
    scoreConflictGroups: audit.semantic.scoreConflictGroups,
    flippedOrientationGroups: audit.semantic.flippedOrientationGroups,
    crossOperationalDayGroups: audit.semantic.crossOperationalDayGroups,
    safeForAliasRepair:
      audit.invalidRowCount === 0 &&
      audit.duplicateIdCount === 0 &&
      audit.operationalDayMismatchCount === 0 &&
      audit.semantic.scoreConflictGroups === 0 &&
      audit.semantic.flippedOrientationGroups === 0 &&
      audit.semantic.crossOperationalDayGroups === 0,
  },
  audit,
};

fs.mkdirSync(resolveDataPath("history-integrity", "shadow"), { recursive: true });
const output = resolveDataPath("history-integrity", "shadow", "current-history-audit.json");
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result.precondition));
console.log(`SHADOW_AUDIT_PATH=${output}`);
