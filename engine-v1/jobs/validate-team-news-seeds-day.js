import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";
import { normalizeTeamKey } from "../storage/team-news-db.js";
import { validateCanonicalTeamNewsPayload } from "../ai-match-intelligence/team-news/team-news-validator.js";

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function normalizeText(value) {
  return String(value || "").trim();
}

function getSeedsDir(dayKey) {
  return path.resolve(process.cwd(), "engine-v1", "seeds", "team-news", "manual-results", dayKey);
}

function getAuditPath(dayKey) {
  return resolveDataPath("team-news", "_manual-result-validation-audit", `${dayKey}.json`);
}

function listSeedFiles(dayKey) {
  const dir = getSeedsDir(dayKey);
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter(name => name.endsWith(".json"))
    .map(name => path.join(dir, name));
}

function isStrictlyApproved(raw = {}) {
  return raw?.reviewed === true &&
    raw?.productionGrade === true &&
    raw?.meta?.reviewed === true &&
    raw?.meta?.productionGrade === true;
}

function normalizeEvidence(items = []) {
  return (Array.isArray(items) ? items : [])
    .map(item => ({
      label: normalizeText(item?.label || item?.title || item?.source),
      url: normalizeText(item?.url || item?.href),
      publisher: normalizeText(item?.publisher || item?.site || item?.domain),
      publishedAt: normalizeText(item?.publishedAt || item?.date)
    }))
    .filter(item => item.label || item.url || item.publisher);
}

function hasUsableEvidence(raw = {}) {
  return normalizeEvidence(raw?.evidence).length > 0;
}

function normalizeAbsenceSide(value) {
  const text = normalizeText(value).toLowerCase();

  if (text === "home") return "home";
  if (text === "away") return "away";

  return null;
}

function splitAbsencesBySide(absences = [], fallbackSide = null) {
  const out = {
    home: [],
    away: [],
    missingSideCount: 0
  };

  for (const item of Array.isArray(absences) ? absences : []) {
    const side = normalizeAbsenceSide(item?.side) || normalizeAbsenceSide(fallbackSide);

    if (side === "home") {
      out.home.push(item);
    } else if (side === "away") {
      out.away.push(item);
    } else {
      out.missingSideCount += 1;
    }
  }

  return out;
}

function flattenValidatedAbsences(canonicalValidation = {}) {
  const home = Array.isArray(canonicalValidation?.data?.home?.absences)
    ? canonicalValidation.data.home.absences.map(item => ({ ...item, side: "home" }))
    : [];

  const away = Array.isArray(canonicalValidation?.data?.away?.absences)
    ? canonicalValidation.data.away.absences.map(item => ({ ...item, side: "away" }))
    : [];

  return [...home, ...away];
}

function hasStrongCanonicalNote(note) {
  const text = normalizeText(note).toLowerCase();

  if (!text) return false;
  if (text.includes("source available")) return false;
  if (text.includes("lineup page available")) return false;
  if (text.includes("preview page available")) return false;

  return /(confirmed|ruled out|suspended|injury|injured|unavailable|doubtful|returned to training|available)/i.test(text);
}

function hasCanonicalFacts(canonicalValidation = {}, candidatePayload = {}) {
  const absences = flattenValidatedAbsences(canonicalValidation);
  const notes = Array.isArray(candidatePayload?.notes) ? candidatePayload.notes : [];

  return absences.length > 0 || notes.some(hasStrongCanonicalNote);
}

export function validateTeamNewsSeedRecord(raw = {}, ctx = {}) {
  const issues = [];

  const team = normalizeText(raw?.team);
  const key = normalizeTeamKey(raw?.key || team);
  const dayKey = normalizeText(ctx.dayKey);

  if (!key) issues.push({ code: "missing_key", message: "missing team key" });
  if (!team) issues.push({ code: "missing_team", message: "missing team name" });

  const sourceInputType = normalizeText(raw?.sourceInputType || raw?.meta?.sourceInputType);
  const source = normalizeText(raw?.source);

  if (sourceInputType !== "manual_result") {
    issues.push({ code: "invalid_source_input_type", message: "team-news seed must use sourceInputType: manual_result" });
  }

  if (source !== "tracked_team_news_manual_result") {
    issues.push({ code: "invalid_source", message: "team-news seed must use source: tracked_team_news_manual_result" });
  }

  if (!isStrictlyApproved(raw)) {
    issues.push({
      code: "manual_result_not_strictly_approved",
      message: "manual team-news result must have reviewed:true and productionGrade:true at root and meta levels before import",
      reviewed: raw?.reviewed ?? null,
      productionGrade: raw?.productionGrade ?? null,
      metaReviewed: raw?.meta?.reviewed ?? null,
      metaProductionGrade: raw?.meta?.productionGrade ?? null
    });
  }

  if (!hasUsableEvidence(raw)) {
    issues.push({ code: "missing_evidence", message: "manual team-news result must include at least one evidence item" });
  }

  const candidatePayload = {
    key,
    team,
    leagueSlug: normalizeText(raw?.leagueSlug) || null,
    matchIds: Array.isArray(raw?.matchIds) ? raw.matchIds : [],
    aliases: Array.isArray(raw?.aliases) ? raw.aliases : [],
    absences: Array.isArray(raw?.absences) ? raw.absences : [],
    notes: Array.isArray(raw?.notes) ? raw.notes : [],
    evidence: normalizeEvidence(raw?.evidence),
    source: source || "tracked_team_news_manual_result",
    sourceMeta: {
      ...(raw?.sourceMeta || {}),
      provider: "manual_team_news_seed",
      mode: "manual_result",
      status: "validated",
      generatedAt: new Date().toISOString(),
      seedDayKey: dayKey,
      reviewed: raw?.reviewed === true,
      productionGrade: raw?.productionGrade === true
    }
  };

  const splitAbsences = splitAbsencesBySide(candidatePayload.absences, raw?.side || raw?.targetSide);

  if (candidatePayload.absences.length > 0 && splitAbsences.missingSideCount > 0) {
    issues.push({
      code: "missing_absence_side",
      message: "manual team-news absences must include side: home or away, or the seed must provide side/targetSide",
      missingSideCount: splitAbsences.missingSideCount
    });
  }

  const canonicalValidationInput = {
    ...candidatePayload,
    data: {
      home: {
        absences: splitAbsences.home
      },
      away: {
        absences: splitAbsences.away
      }
    }
  };

  const canonicalValidation = validateCanonicalTeamNewsPayload(canonicalValidationInput);
  const validatedAbsences = flattenValidatedAbsences(canonicalValidation);
  const finalCanonicalPayload = {
    ...candidatePayload,
    absences: validatedAbsences,
    sourceMeta: {
      ...(candidatePayload.sourceMeta || {}),
      canonicalValidationDiagnostics: canonicalValidation.diagnostics || null
    }
  };

  if (!canonicalValidation.ok) {
    issues.push({ code: "canonical_validation_failed", message: "team-news canonical validator rejected payload" });
  }

  if (!hasCanonicalFacts(canonicalValidation, candidatePayload)) {
    issues.push({ code: "missing_canonical_facts", message: "manual team-news result must include at least one validated absence or strong canonical note" });
  }

  const ok = issues.length === 0;

  return {
    ok,
    status: ok ? "accepted" : "rejected",
    reason: ok ? "accepted_manual_team_news_seed" : (issues[0]?.code || "validation_failed"),
    key,
    team,
    file: ctx.file || null,
    issueCount: issues.length,
    issues,
    canonicalPayload: finalCanonicalPayload
  };
}

export function validateTeamNewsSeedsDay(dayKey) {
  const files = listSeedFiles(dayKey);
  const results = files.map(file => {
    const raw = readJsonSafe(file, null);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {
        ok: false,
        status: "rejected",
        reason: "invalid_json",
        key: null,
        team: null,
        file,
        issueCount: 1,
        issues: [{ code: "invalid_json", message: "seed file is not valid JSON object" }]
      };
    }

    return validateTeamNewsSeedRecord(raw, { dayKey, file });
  });

  const audit = {
    ok: true,
    dayKey,
    recordCount: results.length,
    acceptedCount: results.filter(row => row.ok).length,
    rejectedCount: results.filter(row => !row.ok).length,
    generatedAt: new Date().toISOString(),
    results
  };

  writeJson(getAuditPath(dayKey), audit);

  return {
    ok: true,
    dayKey,
    recordCount: audit.recordCount,
    acceptedCount: audit.acceptedCount,
    rejectedCount: audit.rejectedCount,
    file: getAuditPath(dayKey)
  };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  const dayKey = process.argv[2];

  if (!dayKey) {
    console.error("Usage: node engine-v1/jobs/validate-team-news-seeds-day.js YYYY-MM-DD");
    process.exit(1);
  }

  try {
    const result = validateTeamNewsSeedsDay(dayKey);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("[validate-team-news-seeds-day] failed", err);
    process.exit(1);
  }
}
