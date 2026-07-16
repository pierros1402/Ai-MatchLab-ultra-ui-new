import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDataPath } from "../storage/data-root.js";
import { ensurePlanAObservationDay } from "../value/plan-a-observation.js";

function clean(value) {
  return String(value ?? "").trim();
}

function isDayKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(clean(value));
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    date: "",
    source: "",
    sourcePathLabel: "",
    kind: "daily_freeze",
    sourceCommit: "",
    sourceBlob: "",
    note: "",
    frozenAt: ""
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = clean(argv[i]);
    if (isDayKey(arg)) out.date = arg;
    else if (arg === "--date" && argv[i + 1]) out.date = clean(argv[++i]);
    else if (arg.startsWith("--date=")) out.date = arg.slice("--date=".length);
    else if (arg === "--source" && argv[i + 1]) out.source = clean(argv[++i]);
    else if (arg.startsWith("--source=")) out.source = arg.slice("--source=".length);
    else if (arg.startsWith("--source-path=")) out.sourcePathLabel = arg.slice("--source-path=".length);
    else if (arg.startsWith("--kind=")) out.kind = arg.slice("--kind=".length);
    else if (arg.startsWith("--source-commit=")) out.sourceCommit = arg.slice("--source-commit=".length);
    else if (arg.startsWith("--source-blob=")) out.sourceBlob = arg.slice("--source-blob=".length);
    else if (arg.startsWith("--note=")) out.note = arg.slice("--note=".length);
    else if (arg.startsWith("--frozen-at=")) out.frozenAt = arg.slice("--frozen-at=".length);
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return out;
}

export function freezeValuePlanADay(dayKey, options = {}) {
  const day = clean(dayKey);
  if (!isDayKey(day)) return { ok: false, reason: "invalid_day_key", dayKey };

  const sourceFile = path.resolve(
    options.source || resolveDataPath("deploy-snapshots", day, "value.json")
  );
  if (!fs.existsSync(sourceFile)) {
    return { ok: false, reason: "plan_a_source_file_missing", dayKey: day, sourceFile };
  }

  let sourcePayload;
  try {
    sourcePayload = JSON.parse(fs.readFileSync(sourceFile, "utf8"));
  } catch (error) {
    return {
      ok: false,
      reason: "plan_a_source_json_invalid",
      dayKey: day,
      sourceFile,
      error: error?.message || String(error)
    };
  }

  return ensurePlanAObservationDay(day, sourcePayload, {
    sourcePath: options.sourcePathLabel || path.relative(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."),
      sourceFile
    ).replaceAll("\\", "/"),
    frozenAt: options.frozenAt || new Date().toISOString(),
    provenance: {
      kind: options.kind || "daily_freeze",
      sourceCommit: options.sourceCommit || null,
      sourceBlob: options.sourceBlob || null,
      note: options.note || null
    }
  });
}

function usage() {
  return [
    "Usage:",
    "  node engine-v1/jobs/freeze-value-plan-a-day.js --date=YYYY-MM-DD [--source=FILE]",
    "    [--source-path=ARTIFACT_LABEL] [--kind=git_recovery] [--source-commit=SHA] [--source-blob=SHA]",
    "    [--note=TEXT] [--frozen-at=ISO]"
  ].join("\n");
}

const isCli = (() => {
  try {
    return path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] || "");
  } catch {
    return false;
  }
})();

if (isCli) {
  try {
    const args = parseArgs();
    if (args.help) {
      console.log(usage());
    } else {
      const result = freezeValuePlanADay(args.date, args);
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exitCode = 1;
    }
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      stage: "freeze_value_plan_a_day_failed",
      error: error?.message || String(error)
    }, null, 2));
    process.exitCode = 1;
  }
}
