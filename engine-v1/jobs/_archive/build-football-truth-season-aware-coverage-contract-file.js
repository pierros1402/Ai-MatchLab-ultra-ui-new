#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const contractPath = path.join(ROOT, "engine-v1", "config", "football-truth-season-aware-coverage-contract.json");
if (!fs.existsSync(contractPath)) throw new Error(`Missing season-aware contract: ${contractPath}`);

const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
const outDir = path.join(ROOT, "data", "football-truth", "_diagnostics", `season-aware-coverage-contract-${DATE}`);
fs.mkdirSync(outDir, { recursive: true });

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.isFile()) out.push(p);
  }
  return out;
}

function rel(p) {
  return path.relative(ROOT, p).replaceAll("\\", "/");
}

const dataFiles = walk(path.join(ROOT, "data", "football-truth")).filter((p) => p.endsWith(".json") || p.endsWith(".jsonl") || p.endsWith(".txt") || p.endsWith(".md"));
const slugSet = new Set();

for (const file of dataFiles) {
  let text = "";
  try { text = fs.readFileSync(file, "utf8"); } catch { continue; }
  for (const m of text.matchAll(/\b[a-z]{3}\.(?:\d+|cup)\b/g)) slugSet.add(m[0]);
}

const slugs = [...slugSet].sort();
const leagueSlugs = slugs.filter((s) => /\.\d+$/.test(s));
const cupSlugs = slugs.filter((s) => /\.cup$/.test(s));

const requiredLeagueLaneRows = [];
for (const slug of leagueSlugs) {
  for (const lane of contract.requiredCoverageLanes || []) {
    if (lane.requiredFor === "all_league_competitions" || lane.requiredFor === "active_or_started_league_competitions") {
      requiredLeagueLaneRows.push({
        competitionSlug: slug,
        laneId: lane.laneId,
        required: Boolean(lane.required),
        currentStatus: "needs_source_family_or_provider_evidence"
      });
    }
  }
}

const summary = {
  status: "passed",
  runner: "season_aware_coverage_contract",
  contractPath: rel(contractPath),
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  discoveredCompetitionSlugCount: slugs.length,
  discoveredLeagueSlugCount: leagueSlugs.length,
  discoveredCupSlugCount: cupSlugs.length,
  requiredCoverageLaneCount: (contract.requiredCoverageLanes || []).length,
  requiredLeagueLaneRowCount: requiredLeagueLaneRows.length,
  requiredRowFieldCount: (contract.rowFields || []).length,
  recommendedNextLane: "retrofit_browser_rendered_adapter_to_emit_season_scoped_rows_then_build_start_date_evidence_runner"
};

const report = {
  summary,
  contract,
  requiredLeagueLaneRowsSample: requiredLeagueLaneRows.slice(0, 300),
  discoveredLeagueSlugsSample: leagueSlugs.slice(0, 300),
  discoveredCupSlugsSample: cupSlugs.slice(0, 100)
};

const outPath = path.join(outDir, `season-aware-coverage-contract-${DATE}.json`);
fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");

console.log(JSON.stringify({ output: rel(outPath), summary }, null, 2));
