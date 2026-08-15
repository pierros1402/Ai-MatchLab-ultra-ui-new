import fs from "fs";
import path from "path";
import { pathToFileURL } from "node:url";
import { resolveDataPath } from "../storage/data-root.js";
import { findCanonicalStatusConflicts } from "../core/canonical-status-coherence.js";

function clean(value) {
  return String(value ?? "").trim();
}

function argValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find(value => String(value).startsWith(prefix));
  return hit ? clean(hit).slice(prefix.length) : "";
}

export function auditCanonicalStatusCoherenceRange({ from = "", to = "" } = {}) {
  const root = resolveDataPath("canonical-fixtures");
  const days = fs.existsSync(root)
    ? fs.readdirSync(root, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
        .map(entry => entry.name)
        .filter(day => (!from || day >= from) && (!to || day <= to))
        .sort()
    : [];

  const conflicts = [];
  let filesScanned = 0;
  let rowsScanned = 0;

  for (const dayKey of days) {
    const dir = path.join(root, dayKey);
    for (const name of fs.readdirSync(dir).filter(value => value.endsWith(".json")).sort()) {
      const file = path.join(dir, name);
      let payload;
      try {
        payload = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch (error) {
        conflicts.push({
          path: file,
          dayKey,
          leagueSlug: name.replace(/\.json$/i, ""),
          surface: "parse",
          error: error?.message || String(error)
        });
        continue;
      }

      filesScanned++;
      const fixtures = Array.isArray(payload?.fixtures) ? payload.fixtures : [];
      rowsScanned += fixtures.length;
      conflicts.push(...findCanonicalStatusConflicts(payload, { path: file }).map(item => ({
        dayKey,
        leagueSlug: name.replace(/\.json$/i, ""),
        ...item
      })));
    }
  }

  return {
    ok: conflicts.length === 0,
    schema: "ai-matchlab.canonical-status-coherence-audit.v1",
    from: from || null,
    to: to || null,
    dayCount: days.length,
    filesScanned,
    rowsScanned,
    conflictCount: conflicts.length,
    conflicts
  };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const report = auditCanonicalStatusCoherenceRange({
    from: argValue("from"),
    to: argValue("to")
  });
  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes("--fail-on-conflict") && !report.ok) process.exitCode = 2;
}
