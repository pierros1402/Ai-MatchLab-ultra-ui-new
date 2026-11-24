import {isApprovedStage20JournalPath} from "./daily-resume-stage20-journal-admission.mjs";
// Source-bound policy for the first (not-yet-active) post-cycle checkpoint.
// No command runs production or authorizes a skip. All unknown paths deny capture.
const FAMILIES = Object.freeze([
  "data/canonical-fixtures/",
  "data/details/",
  "data/history-recovery-journal/",
  "data/standings/",
  "data/team-geo/",
  "data/multi-odds/",
  "data/history/",
  "data/history-index/",
  "data/history-coverage/",
  "data/h2h/",
  "data/h2h-foundation/",
  "data/model-priors/",
  "data/coverage-readiness/",
  "data/competition-discovery/",
  "data/provider-competition-registry/",
  "data/team-news/",
  "data/player-usage/",
  "data/plan-c-shadow/",
  "data/value/",
  "data/value-plans/",
  "data/value-comparison/",
  "data/final-results/",
  "data/football-truth/",
  "data/deploy-snapshots/"
]);
const EXT = /\.(json|jsonl|ndjson|csv)$/i;
const SECRET = /(^|[._/-])(secret|credential|password|token|private[-_]?key|\.env)([._/-]|$)/i;
const KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
function validDayKey(value) {
  const match = typeof value === "string" ? KEY.exec(value) : null;
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  // Avoid JavaScript Date.UTC's special handling of years 00..99.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
// Source-owned Details-only narrow exception: canonical fixture ID and its
// YYYYMMDD suffix MUST match the actual day directory. Unknown/legacy paths
// remain denied. This is a path authorization, not a publication gate.
export function isApprovedStage20DetailsPath(p) {
  const m = typeof p === "string" ? p.match(
    /^data\/details\/(\d{4})-(\d{2})-(\d{2})\/(cid_[a-z0-9_]{8,170})\.json$/
  ) : null;
  if (!m) return false;
  const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]);
  const dt=new Date(Date.UTC(y,mo-1,d));
  if(dt.getUTCFullYear()!==y || dt.getUTCMonth()!==mo-1 ||
    dt.getUTCDate()!==d) return false;
  return m[4].endsWith("_"+m[1]+m[2]+m[3]);
}
const forbidden = (p) => typeof p !== "string" || !p.startsWith("data/") ||
  p.startsWith("/") || p.includes("\\") || p.includes("\0") ||
  p.split("/").some(s => !s || s === "." || s === "..") ||
  p.length > 511 || !EXT.test(p) || SECRET.test(p) ||
  (p.startsWith("data/details/") && !isApprovedStage20DetailsPath(p)) ||
  (p.startsWith("data/history-recovery-journal/") && !isApprovedStage20JournalPath(p)) ||
  !FAMILIES.some(prefix => p.startsWith(prefix));
export const STAGE20_POLICY_SCHEMA = "ai-matchlab.daily-stage20-capture-admission.v1";
export const STAGE20_APPROVED_FAMILIES = FAMILIES;
export function evaluateStage20CapturePaths({ dayKey, paths, root = "data/" }) {
  if (!validDayKey(dayKey) || root !== "data/" || !Array.isArray(paths) ||
      !paths.length || paths.length > 10000) {
    return { ok: false, reason: "stage20_capture_inventory_invalid", approved: [], rejected: [] };
  }
  const seen = new Set();
  const rejected = [];
  for (const p of paths) {
    if (seen.has(p) || forbidden(p)) rejected.push(p);
    seen.add(p);
  }
  return { schema: STAGE20_POLICY_SCHEMA, ok: rejected.length === 0,
    reason: rejected.length ? "stage20_capture_unapproved_paths" : null,
    approved: rejected.length ? [] : [...paths].sort(),
    rejected: rejected.map(p => typeof p === "string" ? p : "(invalid)") };
}
