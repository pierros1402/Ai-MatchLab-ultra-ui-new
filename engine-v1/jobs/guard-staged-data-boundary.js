import { execFileSync } from "child_process";
import { readFileSync } from "node:fs";

import { findCanonicalStatusConflicts } from "../core/canonical-status-coherence.js";
import { inspectResultsMemoryPreservation } from "../core/results-memory-preservation.js";
import { verifyResultsWriteSetManifest } from "../core/results-write-set-contract.js";

function argValue(name, fallback = "") {
  const prefix = `--${name}=`;
  const hit = process.argv.find(x => x.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const label = argValue("label", "data-boundary");
const allowPattern = argValue("allow", "");
const dayKey = argValue("dayKey", process.env.DAY_KEY || "");

// Additional day keys whose deploy snapshots may legitimately be staged in
// the same commit: the finalize + late-truth settlement re-export RECENT
// days' snapshots (D-1..D-7), which the single-day rule below used to reject.
const extraDays = argValue("extra-days", "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);
const allowedSnapshotDays = new Set([dayKey, ...extraDays].filter(Boolean));

const forbidCacheTruthMix = hasFlag("forbid-cache-truth-mix");
const allowDataDeletions = process.env.ALLOW_DATA_DELETIONS === "1" || hasFlag("allow-data-deletions");

const allowRe = allowPattern ? new RegExp(allowPattern) : null;

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function gitBytes(args) {
  return execFileSync("git", args);
}

function parseNameStatus(raw) {
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      const parts = line.split("\t");
      const status = parts[0] || "";
      if (status.startsWith("R") || status.startsWith("C")) {
        return { status, oldPath: parts[1] || "", path: parts[2] || "" };
      }
      return { status, oldPath: "", path: parts[1] || "" };
    });
}

function isDataPath(p) {
  return p === "data" || p.startsWith("data/");
}

function isDeploySnapshot(p) {
  return p.startsWith("data/deploy-snapshots/");
}

function isCanonicalFixtureFile(p) {
  return /^data\/canonical-fixtures\/\d{4}-\d{2}-\d{2}\/[^/]+\.json$/i.test(p);
}

function isTruthPath(p) {
  return (
    p.startsWith("data/league-memory/") ||
    p.startsWith("data/history/") ||
    p.startsWith("data/current-season/") ||
    p.startsWith("data/canonical-fixtures/") ||
    p.startsWith("data/identity-recovery/") ||
    p.startsWith("data/identity-decisions/") ||
    p.startsWith("data/football-truth/") ||
    p.startsWith("data/ingest-state/") ||
    p.startsWith("data/standings/") ||
    p.startsWith("data/team-geo/") ||
    p.startsWith("data/team-news/") ||
    p === "data/source-reliability.json" ||
    p === "data/observations.json" ||
    p === "data/backfill-progress.json"
  );
}

function deploySnapshotAllowedForDay(p) {
  if (!dayKey) return true;
  if (p === "data/deploy-snapshots/latest.json") return true;
  for (const d of allowedSnapshotDays) {
    if (p.startsWith(`data/deploy-snapshots/${d}/`)) return true;
  }
  return false;
}

// Deploy-snapshot details are cache artifacts keyed to the day's FINAL fixture
// set; the exporter prunes orphans (details whose fixture dropped out of
// canonical), so their deletion is intended. Truth stores stay
// deletion-protected — this exception covers only guarded days' details.
function isPrunableSnapshotDetail(p) {
  if (!dayKey) return false;
  for (const d of allowedSnapshotDays) {
    if (p.startsWith(`data/deploy-snapshots/${d}/details/`)) return true;
  }
  return false;
}

function inspectStagedCanonicalFile(p, violations) {
  let payload;

  try {
    payload = JSON.parse(git(["show", `:${p}`]));
  } catch (error) {
    violations.push({
      reason: "staged_canonical_json_invalid",
      path: p,
      error: String(error?.message || error)
    });
    return;
  }

  if (enforceCanonicalRowPreservation) {
    try {
      const before = JSON.parse(git(["show", `HEAD:${p}`]));
      const rows = x => Array.isArray(x) ? x :
        Array.isArray(x?.fixtures) ? x.fixtures :
        Array.isArray(x?.matches) ? x.matches :
        Array.isArray(x?.rows) ? x.rows : null;
      const previous = rows(before);
      const current = rows(payload);
      if (!previous || !current) {
        violations.push({reason:"canonical_row_preservation_unverifiable",path:p});
      } else {
        if (current.length < previous.length) {
          violations.push({reason:"canonical_row_count_regression",path:p,before:previous.length,after:current.length});
        }
        const id = row => String(row?.canonicalId || row?.matchId || row?.id || "").trim();
        const priorIds = previous.map(id);
        const nextIds = current.map(id);
        if (priorIds.some(x => !x) || nextIds.some(x => !x) ||
            new Set(priorIds).size !== priorIds.length ||
            new Set(nextIds).size !== nextIds.length) {
          violations.push({reason:"canonical_identity_unverifiable",path:p});
        } else {
          const next = new Map(current.map(row => [id(row),row]));
          for (const row of previous) {
            const key = id(row);
            if (!next.has(key)) {
              violations.push({reason:"canonical_identity_missing",path:p,canonicalId:key});
              continue;
            }
            const terminal = value => {
              const state=String(value?.statusType || value?.status || value?.rawStatus || "").toUpperCase();
              return /^(FT|FINAL|STATUS_FINAL|FINISHED)$/.test(state);
            };
            if (terminal(row)) {
              const fields=["status","statusType","rawStatus","score","homeScore","awayScore",
                "goalsHome","goalsAway","finalScore","authoritativeTerminalWriteback"];
              const original=fields.map(k => JSON.stringify(row[k] ?? null));
              const updated=fields.map(k => JSON.stringify(next.get(key)[k] ?? null));
              if (original.some((value,i) => value !== updated[i])) {
                violations.push({reason:"canonical_verified_terminal_mutation",path:p,canonicalId:key});
              }
            }
          }
        }
      }
    } catch (error) {
      // Newly created canonical files have no HEAD version; they are checked by
      // canonical status validation below. All other read failures fail closed.
      if (git(["ls-tree", "--name-only", "HEAD", "--", p]).trim()) {
        violations.push({reason:"canonical_row_preservation_unverifiable",path:p,
          error:String(error?.message||error)});
      }
    }
  }

  const conflicts = findCanonicalStatusConflicts(payload, { path: p });

  for (const conflict of conflicts) {
    violations.push({
      reason: "staged_canonical_status_conflict",
      ...conflict
    });
  }
}

// Opt-in only until all authorized-correction and rollback contracts are qualified.
const enforceResultsPreservation = hasFlag("enforce-results-preservation");
const enforceCanonicalRowPreservation = hasFlag("enforce-canonical-row-preservation");
const enforceVerifiedFinalPreservation = hasFlag("enforce-verified-final-preservation");
const candidateWriteSetFile = argValue("results-write-set", "");
// Hash binding is evidence only, not external authorization. Never permit an
// unreviewed correction to bypass the ordinary preservation veto.
const stagedCorrectionEntries = [];
function inspectStagedResultsMemory(p, status, violations) {
  if (!/^data\/league-memory\/results\/[^/]+\.json$/.test(p)) return;
  try {
    const before = status === "A" ? { teams: {} } : JSON.parse(git(["show", `HEAD:${p}`]));
    const after = JSON.parse(git(["show", `:${p}`]));
    const expectedSlug = p.slice("data/league-memory/results/".length, -".json".length);
    if (after?.slug !== expectedSlug) {
      violations.push({ reason: "results_memory_slug_path_mismatch", path: p, expectedSlug,
        actualSlug: typeof after?.slug === "string" ? after.slug : null });
      return;
    }
    if (candidateWriteSetFile && status === "M") {
      stagedCorrectionEntries.push({
        path: p, status,
        beforeBytes: gitBytes(["show", `HEAD:${p}`]),
        afterBytes: gitBytes(["show", `:${p}`])
      });
    }
    const check = inspectResultsMemoryPreservation(before, after);
    for (const violation of check.violations) {
      violations.push({ ...violation, path: p });
    }
  } catch (error) {
    violations.push({ reason: "results_memory_preservation_unverifiable", path: p,
      error: String(error?.message || error) });
  }
}

function inspectStagedVerifiedFinal(p, status, violations) {
  if (!p.startsWith("data/final-results/") || !p.endsWith(".json") || p.split("/").length !== 4) return;
  const name = p.slice(p.lastIndexOf("/") + 1, -5);
  const date = p.split("/")[2];
  try {
    const after = JSON.parse(git(["show", `:${p}`]));
    const score = value => {
      const h = value?.homeScore, a = value?.awayScore;
      return Number.isInteger(h) && h >= 0 && Number.isInteger(a) && a >= 0
        ? [h, a] : null;
    };
    if (after?.schema !== "ai-matchlab.verified-final-result.v1" ||
        after?.verifiedFinalTruth !== true ||
        after?.matchId !== name ||
        after?.dayKey !== date ||
        !score(after) ||
        after?.finalScore?.homeScore !== after.homeScore ||
        after?.finalScore?.awayScore !== after.awayScore) {
      violations.push({reason:"verified_final_staged_invalid",path:p});
      return;
    }
    if (status === "M") {
      const before = JSON.parse(git(["show", `HEAD:${p}`]));
      const prior = score(before), next = score(after);
      if (before?.verifiedFinalTruth !== true || before?.matchId !== after.matchId ||
          before?.dayKey !== after.dayKey || !prior ||
          prior[0] !== next[0] || prior[1] !== next[1]) {
        violations.push({reason:"verified_final_truth_mutation_requires_adjudication",path:p});
      }
    }
  } catch (error) {
    violations.push({reason:"verified_final_preservation_unverifiable",path:p,
      error:String(error?.message || error)});
  }
}

const staged = parseNameStatus(git(["diff", "--cached", "--name-status"]));
const violations = [];

let hasTruth = false;
let hasCache = false;

for (const item of staged) {
  const paths = [item.path, item.oldPath].filter(Boolean);

  for (const p of paths) {
    if (isTruthPath(p)) hasTruth = true;
    if (isDeploySnapshot(p)) hasCache = true;
  }

  const statusLetter = item.status.slice(0, 1);

  if (statusLetter === "D" && !allowDataDeletions) {
    for (const p of paths) {
      if (isDataPath(p) && !isPrunableSnapshotDetail(p)) {
        violations.push({
          reason: "data_deletion_blocked",
          status: item.status,
          path: p
        });
      }
    }
  }

  if (allowRe) {
    for (const p of paths) {
      if (!allowRe.test(p)) {
        violations.push({
          reason: "path_outside_allowlist",
          status: item.status,
          path: p,
          allow: allowPattern
        });
      }
    }
  }

  for (const p of paths) {
    if (isDeploySnapshot(p) && !deploySnapshotAllowedForDay(p)) {
      violations.push({
        reason: "deploy_snapshot_wrong_day",
        status: item.status,
        path: p,
        dayKey
      });
    }
  }

  // A rename/copy changes result-memory custody and must not bypass the
  // preservation comparison. Require a separately approved migration.
  if (enforceResultsPreservation &&
      ["R", "C", "D"].includes(statusLetter) &&
      [item.path, item.oldPath].some(p => /^data\/league-memory\/results\/[^/]+\.json$/.test(p))) {
    violations.push({ reason: "results_memory_path_mutation_requires_adjudication",
      status: item.status, path: item.path, oldPath: item.oldPath || null });
  }

  if (enforceResultsPreservation && ["A", "M"].includes(statusLetter)) {
    inspectStagedResultsMemory(item.path, statusLetter, violations);
  }

  if (enforceVerifiedFinalPreservation && ["A", "M"].includes(statusLetter)) {
    inspectStagedVerifiedFinal(item.path, statusLetter, violations);
  }

  if (statusLetter !== "D" && isCanonicalFixtureFile(item.path)) {
    inspectStagedCanonicalFile(item.path, violations);
  }
}

if (candidateWriteSetFile) {
  if (!enforceResultsPreservation) {
    violations.push({reason:"write_set_requires_preservation_guard"});
  } else {
    try {
      const manifest = JSON.parse(readFileSync(candidateWriteSetFile, "utf8"));
      const result = verifyResultsWriteSetManifest(manifest, stagedCorrectionEntries);
      for (const failure of result.failures) violations.push(failure);
      // A matching manifest does not prove approval; no exception to the
      // results-memory preservation checks is granted here.
    } catch (e) {
      violations.push({reason:"write_set_unreadable",error:String(e?.message || e)});
    }
  }
}

if (forbidCacheTruthMix && hasTruth && hasCache) {
  violations.push({
    reason: "cache_truth_mixed_commit_blocked",
    hasTruth,
    hasCache
  });
}

console.log(JSON.stringify({
  ok: violations.length === 0,
  label,
  stagedCount: staged.length,
  hasTruth,
  hasCache,
  dayKey: dayKey || null,
  allowPattern: allowPattern || null,
  allowDataDeletions,
  forbidCacheTruthMix,
  violations
}, null, 2));

if (violations.length) {
  process.exit(2);
}
