import { execFileSync } from "child_process";

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
const forbidCacheTruthMix = hasFlag("forbid-cache-truth-mix");
const allowDataDeletions = process.env.ALLOW_DATA_DELETIONS === "1" || hasFlag("allow-data-deletions");

const allowRe = allowPattern ? new RegExp(allowPattern) : null;

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" });
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

function isTruthPath(p) {
  return (
    p.startsWith("data/league-memory/") ||
    p.startsWith("data/history/") ||
    p.startsWith("data/current-season/") ||
    p.startsWith("data/canonical-fixtures/") ||
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
  return p.startsWith(`data/deploy-snapshots/${dayKey}/`);
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
      if (isDataPath(p)) {
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
