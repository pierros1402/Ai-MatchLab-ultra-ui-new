/**
 * check-value-artifact-gate.js
 *
 * Post-export verification: fail LOUD (non-zero exit) when the exported
 * snapshot shipped `value.json` with source=missing_local_value_file while
 * fixtures exist. That combination is a value-pipeline failure dressed up as
 * "no picks today" — the value panel goes silently empty (2026-07-02 outage
 * mode). Runs in the workflow AFTER the snapshot commit, so the night's data
 * still lands; only the run status turns red for a human to look.
 *
 * Usage: node engine-v1/jobs/check-value-artifact-gate.js --date=YYYY-MM-DD
 * Exit codes: 0 ok · 2 gate failed · 1 manifest unreadable
 */

import fs from "fs";
import { pathToFileURL } from "node:url";
import { resolveDataPath } from "../storage/data-root.js";

export function checkValueArtifactGate(dayKey) {
  const manifestFile = resolveDataPath("deploy-snapshots", dayKey, "manifest.json");

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  } catch (e) {
    return { ok: false, code: 1, reason: "manifest_unreadable", manifestFile, error: String(e?.message || e) };
  }

  // Prefer the gate the exporter computed; fall back to recomputing from the
  // shipped value.json for snapshots exported by older code.
  let gate = manifest?.valueGate;
  if (!gate) {
    const value = (() => {
      try {
        return JSON.parse(fs.readFileSync(resolveDataPath("deploy-snapshots", dayKey, "value.json"), "utf8"));
      } catch {
        return null;
      }
    })();
    gate = {
      fixtures: Number(manifest?.counts?.fixtures || 0),
      valuePicks: Number(value?.count || 0),
      valueSource: String(value?.source || "local_value_file"),
      ok: !(Number(manifest?.counts?.fixtures || 0) > 0 && String(value?.source || "") === "missing_local_value_file"),
      recomputed: true
    };
  }

  return gate.ok
    ? { ok: true, code: 0, gate }
    : { ok: false, code: 2, reason: "missing_local_value_file_with_fixtures", gate };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const dateArg = process.argv.find(a => a.startsWith("--date="))?.split("=")[1];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateArg || ""))) {
    console.error("Usage: node engine-v1/jobs/check-value-artifact-gate.js --date=YYYY-MM-DD");
    process.exit(1);
  }
  const r = checkValueArtifactGate(dateArg);
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.code);
}
