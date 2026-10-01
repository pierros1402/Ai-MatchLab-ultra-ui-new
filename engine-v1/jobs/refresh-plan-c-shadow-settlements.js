import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolveDataPath } from "../storage/data-root.js";
import { validatePlanCShadowDay, canonicalPlanCJson } from "../value/plan-c-shadow-export.js";
import { assertPlanCShadowMonotonic } from "./build-plan-c-shadow-day.js";

export function refreshPlanCSettlements(previous, report) {
  if (report?.ok !== true || report?.mode !== "SHADOW" || report?.productionEligible !== false) throw new Error("invalid_settlement_report");
  const records = new Map();
  for (const record of report.records || []) {
    if (records.has(record.canonicalFixtureId)) throw new Error("duplicate_settlement_record");
    records.set(record.canonicalFixtureId, record);
  }
  const next = structuredClone(previous);
  for (const entry of next.entries) {
    const record = records.get(entry.prediction.canonicalFixtureId);
    if (!record || record.state === "PENDING") continue;
    if (record.prediction?.signature !== entry.prediction.predictionSignature) throw new Error("settlement_prediction_signature_conflict");
    entry.settlement = { state: record.state, truth: record.truth ?? null,
      pendingReason: record.pendingReason ?? null, brier: record.brier ?? null, hitRate: record.hitRate ?? null };
  }
  const validation = validatePlanCShadowDay(next, previous.date);
  if (!validation.ok) throw new Error(validation.errors.join(","));
  assertPlanCShadowMonotonic(previous, next);
  return { payload: next, changed: canonicalPlanCJson(next) !== canonicalPlanCJson(previous) };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const day = process.argv[2];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || "")) throw new Error("invalid_day");
  const root = resolveDataPath("plan-c-shadow");
  const report = JSON.parse(fs.readFileSync(path.join(root, "settlement", "latest.json"), "utf8"));
  const changedDays = [];
  for (const name of fs.readdirSync(root).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort()) {
    const file = path.join(root, name);
    const result = refreshPlanCSettlements(JSON.parse(fs.readFileSync(file, "utf8")), report);
    if (!result.changed) continue;
    const bytes = JSON.stringify(result.payload, null, 2) + "\n";
    fs.writeFileSync(file, bytes);
    const auditFile = path.join(root, "_audit", name);
    const audit = JSON.parse(fs.readFileSync(auditFile, "utf8"));
    audit.outputSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    audit.settlementSource = "canonical_settlement_report";
    fs.writeFileSync(auditFile, JSON.stringify(audit, null, 2) + "\n");
    changedDays.push(name.slice(0, 10));
  }
  fs.writeFileSync(path.join(root, "_audit", `settlement-refresh-${day}.json`), JSON.stringify({ ok: true, date: day, changedDays }, null, 2) + "\n");
  console.log(JSON.stringify({ ok: true, changedDays }));
}
