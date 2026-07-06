import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Cumulative Plan A vs Plan B comparison.
//
// Each day, build-value-plan-comparison-day.js writes a per-day settled
// comparison to data/value-comparison/<day>.json. That answers "how did the
// two plans do on this one day" — but with a handful of picks per day it is
// pure noise. To judge which plan is actually better you need to add the days
// up. This job reads every per-day comparison and writes a single rolled-up
// data/value-comparison/cumulative.json with per-plan totals and Plan B - Plan A
// deltas, so "Plan A vs Plan B over the last N days" is one file, not N.
//
// odds↔value firewall: this only re-aggregates already-settled per-day
// artifacts. It never reads odds and never touches value derivation.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");

function dataPath(...parts) {
  return path.join(ROOT, "data", ...parts);
}

function readJsonSafe(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonPretty(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

// Fields that add straight across days.
const SUM_FIELDS = [
  "picks",
  "uniqueMatches",
  "settled",
  "wins",
  "losses",
  "unresolved",
  "unsupported",
  "oddsAvailable",
  "totalStake",
  "totalReturn",
  "profit"
];

function emptyTotals() {
  const t = {};
  for (const f of SUM_FIELDS) t[f] = 0;
  return t;
}

function addInto(totals, summary) {
  for (const f of SUM_FIELDS) {
    const v = Number(summary?.[f]);
    if (Number.isFinite(v)) totals[f] += v;
  }
}

// hitRate/roi are derived from the summed totals, never averaged across days
// (a day with 1 pick must not weigh the same as a day with 10).
function finalizeTotals(totals) {
  const settled = totals.settled || 0;
  const stake = totals.totalStake || 0;
  return {
    ...totals,
    hitRate: settled > 0 ? Number((totals.wins / settled).toFixed(4)) : null,
    roi: stake > 0 ? Number((totals.profit / stake).toFixed(4)) : null
  };
}

function delta(b, a) {
  if (a === null || a === undefined || b === null || b === undefined) return null;
  return Number((b - a).toFixed(4));
}

function listComparisonDays(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .map(name => name.slice(0, -".json".length))
    .sort();
}

export function buildValueComparisonCumulative(options = {}) {
  const dir = options.dir || dataPath("value-comparison");
  const outputPath = options.output || path.join(dir, "cumulative.json");

  const days = listComparisonDays(dir);

  const totalsA = emptyTotals();
  const totalsB = emptyTotals();
  const daysIncluded = [];
  let planAMeta = { id: "plan-a", label: "Plan A - current UI value" };
  let planBMeta = { id: "plan-b", label: "Plan B - strict value-policy-v2.3 observation" };

  for (const day of days) {
    const payload = readJsonSafe(path.join(dir, `${day}.json`), null);
    const A = payload?.plans?.A?.summary;
    const B = payload?.plans?.B?.summary;
    if (!A || !B) continue;

    addInto(totalsA, A);
    addInto(totalsB, B);
    daysIncluded.push(day);

    if (payload?.plans?.A?.id) planAMeta = { id: payload.plans.A.id, label: payload.plans.A.label };
    if (payload?.plans?.B?.id) planBMeta = { id: payload.plans.B.id, label: payload.plans.B.label };
  }

  const finalA = finalizeTotals(totalsA);
  const finalB = finalizeTotals(totalsB);

  const payload = {
    ok: true,
    schema: "ai-matchlab.value-plan-comparison-cumulative.v1",
    generatedAt: new Date().toISOString(),
    note: "Rolled-up Plan A vs Plan B across every settled per-day comparison. Firewall: re-aggregation of settled artifacts only; no odds enter value.",
    dayCount: daysIncluded.length,
    firstDay: daysIncluded[0] || null,
    lastDay: daysIncluded[daysIncluded.length - 1] || null,
    daysIncluded,
    plans: {
      A: { ...planAMeta, totals: finalA },
      B: { ...planBMeta, totals: finalB }
    },
    comparison: {
      picksDeltaPlanBMinusPlanA: delta(finalB.picks, finalA.picks),
      settledDeltaPlanBMinusPlanA: delta(finalB.settled, finalA.settled),
      winsDeltaPlanBMinusPlanA: delta(finalB.wins, finalA.wins),
      lossesDeltaPlanBMinusPlanA: delta(finalB.losses, finalA.losses),
      hitRateDeltaPlanBMinusPlanA: delta(finalB.hitRate, finalA.hitRate),
      roiDeltaPlanBMinusPlanA: delta(finalB.roi, finalA.roi)
    }
  };

  if (options.write !== false) {
    writeJsonPretty(outputPath, payload);
  }

  return { ok: true, outputPath, dayCount: daysIncluded.length, payload };
}

function parseArgs(argv) {
  const out = { write: false };
  for (const arg of argv) {
    if (arg === "--write") out.write = true;
    else if (arg.startsWith("--dir=")) out.dir = arg.slice("--dir=".length);
    else if (arg.startsWith("--output=")) out.output = arg.slice("--output=".length);
  }
  return out;
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirect) {
  const options = parseArgs(process.argv.slice(2));
  const result = buildValueComparisonCumulative(options);
  console.log(
    "[value-comparison-cumulative] done",
    JSON.stringify({
      dayCount: result.dayCount,
      firstDay: result.payload.firstDay,
      lastDay: result.payload.lastDay,
      planA: result.payload.plans.A.totals,
      planB: result.payload.plans.B.totals,
      comparison: result.payload.comparison,
      written: options.write ? result.outputPath : "(dry-run, pass --write)"
    })
  );
}
