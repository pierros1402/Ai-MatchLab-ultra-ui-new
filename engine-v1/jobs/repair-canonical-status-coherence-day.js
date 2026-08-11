import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findCanonicalStatusConflicts } from "../core/canonical-status-coherence.js";
import { applyCanonicalStatusCoherenceRepair } from "../core/canonical-status-coherence-repair.js";
import { resolveDataPath } from "../storage/data-root.js";

function clean(value) {
  return String(value ?? "").trim();
}

function isDayKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(clean(value));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, payload) {
  const temp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(temp, filePath);
}

function rowsWithShape(payload) {
  if (Array.isArray(payload)) return { rows: payload, key: null };
  for (const key of ["fixtures", "matches", "rows"]) {
    if (Array.isArray(payload?.[key])) return { rows: payload[key], key };
  }
  return { rows: [], key: null };
}

function rowId(row) {
  return clean(row?.canonicalId || row?.matchId || row?.id);
}

export function repairCanonicalStatusCoherenceDay(
  dayKey,
  {
    write = false,
    canonicalRoot = resolveDataPath("canonical-fixtures"),
    finalRoot = resolveDataPath("final-results"),
    repairedAt = new Date().toISOString()
  } = {}
) {
  const day = clean(dayKey);
  if (!isDayKey(day)) throw new Error(`invalid_day_key:${dayKey}`);

  const dayDir = path.join(canonicalRoot, day);
  if (!fs.existsSync(dayDir)) throw new Error(`canonical_day_missing:${day}`);

  const report = {
    schema: "ai-matchlab.canonical-status-coherence-repair-report.v1",
    dayKey: day,
    generatedAt: repairedAt,
    writeRequested: write === true,
    scannedFiles: 0,
    scannedRows: 0,
    conflictRows: 0,
    repairedRows: 0,
    filesWritten: 0,
    unresolved: [],
    repairs: []
  };

  for (const name of fs.readdirSync(dayDir).filter(name => name.endsWith(".json")).sort()) {
    const filePath = path.join(dayDir, name);
    const payload = readJson(filePath);
    const shaped = rowsWithShape(payload);
    report.scannedFiles++;
    report.scannedRows += shaped.rows.length;

    let changed = false;
    const nextRows = shaped.rows.map((row, index) => {
      const conflicts = findCanonicalStatusConflicts({ fixtures: [row] }, { path: filePath });
      if (conflicts.length === 0) return row;

      report.conflictRows++;
      const matchId = rowId(row);
      const finalFile = matchId ? path.join(finalRoot, day, `${matchId}.json`) : "";

      if (!matchId || !finalFile || !fs.existsSync(finalFile)) {
        report.unresolved.push({ file: name, index, matchId: matchId || null, reason: "verified_final_artifact_missing" });
        return row;
      }

      const finalResult = readJson(finalFile);
      const result = applyCanonicalStatusCoherenceRepair({
        canonicalRow: row,
        finalResult,
        dayKey: day,
        repairedAt
      });

      if (!result.changed) {
        report.unresolved.push({ file: name, index, matchId, reason: result.reason || "repair_not_applied" });
        return row;
      }

      changed = true;
      report.repairedRows++;
      report.repairs.push({
        file: name,
        index,
        matchId,
        provider: result.evaluation.provider,
        providerMatchId: result.evaluation.providerMatchId,
        correctedRawStatus: result.row.rawStatus
      });
      return result.row;
    });

    if (!changed) continue;

    const nextPayload = shaped.key === null
      ? nextRows
      : { ...payload, [shaped.key]: nextRows, updatedAt: repairedAt };

    const remaining = findCanonicalStatusConflicts(nextPayload, { path: filePath });
    if (remaining.length > 0) {
      throw new Error(`canonical_status_repair_file_postcondition_failed:${name}:${remaining.length}`);
    }

    if (write === true) {
      writeJsonAtomic(filePath, nextPayload);
      report.filesWritten++;
    }
  }

  report.ok = report.unresolved.length === 0;
  report.writeApplied = write === true && report.ok;
  return report;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  try {
    const args = process.argv.slice(2).map(value => clean(value));
    const dayKey = args.find(isDayKey) || args.find(value => value && !value.startsWith("--")) || "";
    const write = args.includes("--write");
    const result = repairCanonicalStatusCoherenceDay(dayKey, { write });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(2);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
