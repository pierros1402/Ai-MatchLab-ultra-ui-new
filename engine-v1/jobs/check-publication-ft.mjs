#!/usr/bin/env node
// P0 publication gate: compare canonical terminal truth against the snapshot.
// This is read-only. No inference from elapsed time or Value settlement.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function rows(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["fixtures", "matches", "rows"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  throw new Error("UNSUPPORTED_ROWS_SHAPE");
}
function resultType(row) {
  if (!Number.isInteger(row?.scoreHome) || row.scoreHome < 0 ||
      !Number.isInteger(row?.scoreAway) || row.scoreAway < 0) return null;
  const s = String(row.status || "").toUpperCase();
  const r = String(row.rawStatus || "").toUpperCase();
  if (s === "FT" && ["FT", "STATUS_FULL_TIME", "STATUS_FINAL"].includes(r)) return "FT";
  if (["AET", "STATUS_FINAL_AET", "FT"].includes(s) && ["AET", "STATUS_FINAL_AET"].includes(r)) return "AET";
  if (["PEN", "STATUS_FINAL_PEN", "FT"].includes(s) && ["PEN", "STATUS_FINAL_PEN"].includes(r)) return "PEN";
  return null;
}
const declaredTerminal = row => ["FT", "AET", "PEN", "STATUS_FULL_TIME", "STATUS_FINAL", "STATUS_FINAL_AET", "STATUS_FINAL_PEN"]
  .some(x => x === String(row?.status || "").toUpperCase() || x === String(row?.rawStatus || "").toUpperCase());
const rowId = row => String(row?.canonicalId || row?.matchId || "").trim();

export function checkPublicationFT({ day, root }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day))) throw Error("INVALID_DAY");
  const errors = [];
  const base = path.resolve(root || process.cwd(), "data");
  const canonicalDir = path.join(base, "canonical-fixtures", day);
  const snapshotDir = path.join(base, "deploy-snapshots", day);
  const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
  const canon = [];
  if (!fs.existsSync(canonicalDir)) errors.push({ code: "CANONICAL_DAY_MISSING" });
  else {
    for (const file of fs.readdirSync(canonicalDir).filter(x => x.endsWith(".json")).sort()) {
      try { canon.push(...rows(read(path.join(canonicalDir, file)))); }
      catch (error) { errors.push({ code: "CANONICAL_FILE_UNREADABLE", file, reason: String(error.message) }); }
    }
  }
  let published = [];
  for (const name of ["manifest.json", "fixtures.json", "fixtures-all.json"]) {
    const file = path.join(snapshotDir, name);
    if (!fs.existsSync(file)) {
      errors.push({ code: "SNAPSHOT_ARTIFACT_MISSING", name });
      continue;
    }
    try {
      const payload = read(file);
      if (name === "manifest.json" && payload?.ok !== true) errors.push({ code: "MANIFEST_NOT_OK" });
      if (name === "fixtures.json") {
        published = rows(payload);
        if (payload?.date && payload.date !== day) errors.push({ code: "PUBLISHED_DAY_MISMATCH" });
        if (Number.isInteger(payload?.count) && payload.count !== published.length) errors.push({ code: "PUBLISHED_COUNT_MISMATCH" });
      }
    } catch (error) { errors.push({ code: "SNAPSHOT_ARTIFACT_INVALID", name, reason: String(error.message) }); }
  }
  const index = new Map();
  for (const row of published) {
    const id = rowId(row);
    if (!id) errors.push({ code: "PUBLISHED_ID_MISSING" });
    else if (index.has(id)) errors.push({ code: "DUPLICATE_PUBLISHED_ID", id });
    else index.set(id, row);
  }
  const seen = new Set();
  let terminalCount = 0;
  for (const row of canon) {
    const id = rowId(row);
    if (!id) { errors.push({ code: "CANONICAL_ID_MISSING" }); continue; }
    if (seen.has(id)) { errors.push({ code: "DUPLICATE_CANONICAL_ID", id }); continue; }
    seen.add(id);
    const kind = resultType(row);
    if (!kind) {
      if (declaredTerminal(row)) errors.push({ code: "CANONICAL_TERMINAL_UNVERIFIABLE", id });
      continue;
    }
    terminalCount++;
    const pub = index.get(id);
    if (!pub) { errors.push({ code: "CANONICAL_TERMINAL_NOT_PUBLISHED", id }); continue; }
    if (resultType(pub) !== kind) errors.push({ code: "TERMINAL_STATUS_REGRESSION", id });
    if (pub.scoreHome !== row.scoreHome || pub.scoreAway !== row.scoreAway)
      errors.push({ code: "TERMINAL_SCORE_REGRESSION", id, expected: [row.scoreHome, row.scoreAway], actual: [pub.scoreHome, pub.scoreAway] });
    if (kind !== "FT") for (const field of ["penalties", "regularTimeScore", "extraTimeScore"])
      if (row[field] !== undefined && JSON.stringify(row[field]) !== JSON.stringify(pub[field]))
        errors.push({ code: "TERMINAL_SCORE_NAMESPACE_MISMATCH", id, field });
  }
  return { schema: "aiml.p0.ft-publication-consistency.v1", day, canonicalCount: canon.length,
    publishedCount: published.length, canonicalTerminalCount: terminalCount, ok: errors.length === 0,
    errors, repositoryWrites: 0, productionWrites: 0 };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = key => process.argv.find(x => x.startsWith("--" + key + "="))?.slice(key.length + 3);
  try {
    const report = checkPublicationFT({ day: arg("day"), root: arg("root") });
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.ok ? 0 : 2;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, reason: String(error.message) }));
    process.exitCode = 2;
  }
}
