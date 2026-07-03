/**
 * dedup-results-cleanup.js  (one-off, re-runnable)
 *
 * Collapses the cross-source duplicate matches that piled up in
 * data/league-memory/results/{slug}.json (native Flashscore + espn_* + sofa_* copies
 * of the same fixture under team-name variants) using the shared canonicalizer in
 * ../storage/result-dedup.js.
 *
 * For every league file it:
 *   1. reconstructs matches, unions team-name variants, dedups to one row per fixture
 *      (native id + spelling preferred),
 *   2. rewrites the results file (unless --dry),
 *   3. merges the LEARNED aliases back into data/team-aliases/{slug}.json so the
 *      write-time guard and archive builder benefit going forward.
 *
 * After this, rebuild downstream artifacts:
 *   node engine-v1/jobs/build-history-archive-from-results.js --overwrite-source=results-memory --leagues=<changed>
 *   node engine-v1/jobs/build-model-priors.js
 *
 * Flags:
 *   --dry            analyze + report only, write nothing
 *   --no-aliases     skip persisting learned aliases
 *   --leagues=a,b    limit to specific slugs
 *   --top=N          show N most-affected leagues in the summary (default 25)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveDataPath } from "../storage/data-root.js";
import { canonicalizeLeagueResults } from "../storage/result-dedup.js";

const RESULTS_DIR = resolveDataPath("league-memory", "results");
const ALIASES_DIR = resolveDataPath("team-aliases");

function readJsonSafe(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

function mergeLearnedAliases(slug, learned) {
  if (!learned || !Object.keys(learned).length) return 0;
  const file = path.join(ALIASES_DIR, `${slug}.json`);
  const existing = readJsonSafe(file, {}) || {};
  let added = 0;

  for (const [canonical, variants] of Object.entries(learned)) {
    const cur = new Set(Array.isArray(existing[canonical]) ? existing[canonical] : []);
    for (const v of variants) {
      if (v && v !== canonical && !cur.has(v)) { cur.add(v); added += 1; }
    }
    if (cur.size) existing[canonical] = [...cur];
  }

  if (added) {
    if (!fs.existsSync(ALIASES_DIR)) fs.mkdirSync(ALIASES_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(existing, null, 2), "utf8");
  }
  return added;
}

export function runDedupCleanup(opts = {}) {
  const dry = Boolean(opts.dry);
  const persistAliases = opts.persistAliases !== false;
  const onlyLeagues = Array.isArray(opts.leagues) && opts.leagues.length ? new Set(opts.leagues) : null;

  let files = [];
  try {
    files = fs.readdirSync(RESULTS_DIR).filter(f => f.endsWith(".json") && !f.startsWith("_"));
  } catch { files = []; }

  const summary = {
    dry,
    filesScanned: 0,
    filesChanged: 0,
    sourceRecords: 0,
    dedupedMatches: 0,
    matchesMerged: 0,
    entriesRemoved: 0,
    aliasesLearned: 0,
    aliasVariantsPersisted: 0,
    byLeague: []
  };

  for (const f of files) {
    const slug = f.replace(/\.json$/, "");
    if (onlyLeagues && !onlyLeagues.has(slug)) continue;

    const payload = readJsonSafe(path.join(RESULTS_DIR, f), null);
    if (!payload?.teams) continue;

    summary.filesScanned += 1;
    const { payload: cleaned, stats, learnedAliases } = canonicalizeLeagueResults(payload, { slug });

    summary.sourceRecords += stats.sourceRecords;
    summary.dedupedMatches += stats.dedupedMatches;
    summary.matchesMerged += stats.matchesMerged;
    summary.entriesRemoved += stats.entriesRemoved;

    const changed = stats.entriesRemoved !== 0 || stats.teamsAfter !== stats.teamsBefore;
    if (changed) {
      summary.filesChanged += 1;
      summary.byLeague.push({
        slug,
        merged: stats.matchesMerged,
        entriesRemoved: stats.entriesRemoved,
        teamsBefore: stats.teamsBefore,
        teamsAfter: stats.teamsAfter,
        learned: stats.clustersLearned
      });
    }

    if (!dry && changed) {
      cleaned.updatedAt = new Date().toISOString();
      cleaned.dedupedAt = cleaned.updatedAt;
      fs.writeFileSync(path.join(RESULTS_DIR, f), JSON.stringify(cleaned, null, 2), "utf8");
    }

    if (persistAliases && Object.keys(learnedAliases).length) {
      summary.aliasesLearned += Object.keys(learnedAliases).length;
      if (!dry) summary.aliasVariantsPersisted += mergeLearnedAliases(slug, learnedAliases);
    }
  }

  summary.byLeague.sort((a, b) => b.entriesRemoved - a.entriesRemoved);
  return summary;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const args = process.argv.slice(2);
  const has = (f) => args.includes(f);
  const val = (k) => {
    const hit = args.find(a => a.startsWith(`${k}=`));
    return hit ? hit.slice(k.length + 1) : null;
  };
  const parseList = (v) => String(v || "").split(",").map(x => x.trim()).filter(Boolean);
  const top = Number(val("--top")) || 25;

  const summary = runDedupCleanup({
    dry: has("--dry"),
    persistAliases: !has("--no-aliases"),
    leagues: parseList(val("--leagues"))
  });

  console.log(JSON.stringify({
    ...summary,
    byLeague: summary.byLeague.slice(0, top),
    byLeagueTruncated: Math.max(0, summary.byLeague.length - top)
  }, null, 2));
}
