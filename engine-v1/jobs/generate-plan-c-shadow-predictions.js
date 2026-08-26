import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";
import { lambdasFromStandings, marketProbabilities } from "../odds/ai-odds-model.js";
import {
  planCPredictionSetHash,
  planCPredictionSignature
} from "../value/plan-c-shadow-export.js";

const DEFAULT_ELO_COEFFICIENT = 0.15;
const DEFAULT_OVER25_THRESHOLD = 0.55;
const DEFAULT_LEAGUE_AVG_GOALS_PER_TEAM = 1.35;
const DEFAULT_MAX_SNAPSHOT_AGE_DAYS = 30;

function clean(value) {
  return String(value ?? "").trim();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readUtf8LfBytes(filePath) {
  const normalized = fs.readFileSync(filePath, "utf8").replace(/\r\n/gu, "\n");
  return Buffer.from(normalized, "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, payload) {
  ensureDir(path.dirname(filePath));
  const temporary = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, filePath);
}

function normalizeName(value) {
  return clean(value).normalize("NFD").replace(/\s+/gu, " ").toLowerCase();
}

function identityKey(name, leagueSlug) {
  return `${normalizeName(name)}\u001f${clean(leagueSlug)}`;
}

function addDays(dayKey, days) {
  const value = new Date(`${dayKey}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function fixtureArray(document) {
  if (Array.isArray(document)) return document;
  if (Array.isArray(document?.fixtures)) return document.fixtures;
  if (Array.isArray(document?.matches)) return document.matches;
  return [];
}

function formOptions(teamEntry) {
  const recent = teamEntry?.last5;
  const sample = Number(recent?.played) || 0;
  if (!sample) return undefined;
  return {
    sample,
    gfRate: Number(recent.gf) / sample,
    gaRate: Number(recent.ga) / sample
  };
}

function standingsRow(teamEntry) {
  return {
    goalsFor: Number(teamEntry?.total?.gf) || 0,
    goalsAgainst: Number(teamEntry?.total?.ga) || 0,
    played: Number(teamEntry?.total?.played) || 0
  };
}

function repositoryHead() {
  if (/^[0-9a-f]{40}$/u.test(clean(process.env.GITHUB_SHA))) return clean(process.env.GITHUB_SHA);
  try {
    return clean(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }));
  } catch {
    return null;
  }
}

function artifactRecord(root, relativePath) {
  assert(relativePath && !relativePath.includes("\\") && !relativePath.split("/").includes(".."), `unsafe_artifact_path:${relativePath}`);
  const filePath = path.join(root, ...relativePath.split("/"));
  const bytes = readUtf8LfBytes(filePath);
  return { path: relativePath, bytes: bytes.length, sha256: sha256(bytes) };
}

function validateExistingBundle(predictionRoot) {
  const indexFile = path.join(predictionRoot, "PREDICTION_INDEX.json");
  assert(fs.existsSync(indexFile), "prediction_index_missing");
  const index = readJson(indexFile);
  assert(Array.isArray(index.predictions), "prediction_index_invalid");
  assert(index.accounting?.total === index.predictions.length, "prediction_index_count_mismatch");
  const seen = new Set();
  const predictions = [];
  for (const row of index.predictions) {
    const id = clean(row.canonicalFixtureId);
    assert(id && !seen.has(id), `duplicate_existing_prediction:${id}`);
    seen.add(id);
    const relativePath = clean(row.relativePath);
    assert(relativePath.startsWith("predictions/") && !relativePath.includes("\\") && !relativePath.split("/").includes(".."), `prediction_path_invalid:${relativePath}`);
    const filePath = path.join(predictionRoot, ...relativePath.split("/"));
    assert(fs.existsSync(filePath), `prediction_file_missing:${relativePath}`);
    const prediction = readJson(filePath);
    assert(prediction.canonicalFixtureId === id, `prediction_id_mismatch:${id}`);
    assert(prediction.predictionSignature === row.predictionSignature, `prediction_index_signature_mismatch:${id}`);
    assert(planCPredictionSignature(prediction) === prediction.predictionSignature, `prediction_signature_mismatch:${id}`);
    predictions.push(prediction);
  }
  return { index, predictions, seen };
}

function loadIdentityRegistry(predictionRoot) {
  const filePath = path.join(predictionRoot, "IDENTITY_REGISTRY.json");
  assert(fs.existsSync(filePath), "identity_registry_missing");
  const document = readJson(filePath);
  assert(document?.accounting?.total === 48, "identity_registry_count_not_48");
  assert(Array.isArray(document.registry) && document.registry.length === 48, "identity_registry_entries_not_48");
  const defaultSnapshotRetrievedAt = clean(document?.source?.snapshotRetrievedAt);
  assert(Number.isFinite(Date.parse(defaultSnapshotRetrievedAt)), "identity_snapshot_timestamp_invalid");
  const latestRefreshRetrievedAt = clean(document?.source?.latestRefreshRetrievedAt || defaultSnapshotRetrievedAt);
  assert(Number.isFinite(Date.parse(latestRefreshRetrievedAt)), "identity_latest_refresh_timestamp_invalid");
  const map = new Map();
  for (const identity of document.registry) {
    assert(identity.federationAgreement === true, `identity_federation_unverified:${identity.projectId}`);
    assert(Number.isFinite(identity.clubeloElo), `identity_elo_missing:${identity.projectId}`);
    const key = identityKey(identity.projectName, identity.projectLeague);
    assert(!map.has(key), `identity_registry_duplicate:${key}`);
    map.set(key, identity);
  }
  return { document, map, filePath, defaultSnapshotRetrievedAt, latestRefreshRetrievedAt };
}

function identitySnapshotTime(identity, registry) {
  return clean(identity?.eloRetrievedAt || registry.defaultSnapshotRetrievedAt);
}

function scanFixtures({ truthRoot, dayKey, daysForward }) {
  const fixtures = new Map();
  let sourceFiles = 0;
  let sourceRows = 0;
  for (let offset = 0; offset <= daysForward; offset += 1) {
    const day = addDays(dayKey, offset);
    const dayDir = path.join(truthRoot, day);
    if (!fs.existsSync(dayDir)) continue;
    for (const name of fs.readdirSync(dayDir).filter(item => item.endsWith(".json")).sort()) {
      const filePath = path.join(dayDir, name);
      const leagueSlug = path.basename(name, ".json");
      const rows = fixtureArray(readJson(filePath));
      sourceFiles += 1;
      sourceRows += rows.length;
      rows.forEach((fixture, sourceIndex) => {
        const canonicalFixtureId = clean(fixture.canonicalId || fixture.matchId || fixture.id);
        const homeTeam = clean(fixture.homeTeam?.name || fixture.homeTeam);
        const awayTeam = clean(fixture.awayTeam?.name || fixture.awayTeam);
        const kickoffUtc = clean(fixture.kickoffUtc || fixture.kickoff);
        assert(canonicalFixtureId && homeTeam && awayTeam && Number.isFinite(Date.parse(kickoffUtc)), `canonical_fixture_invalid:${day}:${leagueSlug}:${sourceIndex}`);
        const candidate = {
          canonicalFixtureId,
          day,
          leagueSlug: clean(fixture.leagueSlug) || leagueSlug,
          kickoffUtc,
          homeTeam,
          awayTeam,
          status: clean(fixture.status).toUpperCase(),
          sourcePath: path.posix.join("data", "canonical-fixtures", day, name)
        };
        if (fixtures.has(canonicalFixtureId)) {
          const previous = fixtures.get(canonicalFixtureId);
          assert(JSON.stringify(previous) === JSON.stringify(candidate), `canonical_fixture_conflict:${canonicalFixtureId}`);
          return;
        }
        fixtures.set(canonicalFixtureId, candidate);
      });
    }
  }
  return { fixtures: Array.from(fixtures.values()).sort((a, b) => a.canonicalFixtureId.localeCompare(b.canonicalFixtureId)), sourceFiles, sourceRows };
}

function buildPrediction({ fixture, homeIdentity, awayIdentity, teamForm, predictionCreatedAt, snapshotRetrievedAt, modelBinding }) {
  const homeFormEntry = teamForm[fixture.homeTeam];
  const awayFormEntry = teamForm[fixture.awayTeam];
  const baseline = lambdasFromStandings(
    standingsRow(homeFormEntry),
    standingsRow(awayFormEntry),
    {
      leagueAvgGoalsPerTeam: modelBinding.leagueAvgGoalsPerTeam,
      homeForm: formOptions(homeFormEntry),
      awayForm: formOptions(awayFormEntry)
    }
  );
  const lambdaHome = Number(baseline.lambdaHome);
  const lambdaAway = Number(baseline.lambdaAway);
  assert(Number.isFinite(lambdaHome) && Number.isFinite(lambdaAway), `baseline_lambda_invalid:${fixture.canonicalFixtureId}`);
  const baselineOver25 = Number(marketProbabilities(lambdaHome, lambdaAway)?.OU25?.over);
  assert(Number.isFinite(baselineOver25), `baseline_probability_invalid:${fixture.canonicalFixtureId}`);
  const eloEdge = (homeIdentity.clubeloElo - awayIdentity.clubeloElo) / 400;
  const adjustedLambdaHome = Math.max(0.15, Math.min(5, lambdaHome * Math.exp(modelBinding.eloCoefficient * eloEdge)));
  const adjustedLambdaAway = Math.max(0.15, Math.min(5, lambdaAway * Math.exp(-modelBinding.eloCoefficient * eloEdge)));
  const adjustedOver25 = Number(marketProbabilities(adjustedLambdaHome, adjustedLambdaAway)?.OU25?.over);
  assert(Number.isFinite(adjustedOver25), `adjusted_probability_invalid:${fixture.canonicalFixtureId}`);
  const prediction = {
    schema: "ai-matchlab.plan-c-shadow-prediction.v1.2",
    canonicalFixtureId: fixture.canonicalFixtureId,
    leagueSlug: fixture.leagueSlug,
    day: fixture.day,
    kickoffUtc: fixture.kickoffUtc,
    snapshotRetrievedAt,
    predictionCreatedAt,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    homeProjectId: homeIdentity.projectId,
    awayProjectId: awayIdentity.projectId,
    homeFederation: homeIdentity.projectFederation,
    awayFederation: awayIdentity.projectFederation,
    homeClubEloSlug: homeIdentity.clubeloSlug,
    awayClubEloSlug: awayIdentity.clubeloSlug,
    homeElo: homeIdentity.clubeloElo,
    awayElo: awayIdentity.clubeloElo,
    identityCategory: "both",
    eloApplied: true,
    eloEdge: Number(eloEdge.toFixed(6)),
    baseline: {
      lambdaHome: Number(lambdaHome.toFixed(6)),
      lambdaAway: Number(lambdaAway.toFixed(6)),
      pOver25: Number(baselineOver25.toFixed(8)),
      formUsed: Boolean(baseline.formUsed),
      xgUsed: Boolean(baseline.xgUsed)
    },
    adjusted: {
      lambdaHome: Number(adjustedLambdaHome.toFixed(6)),
      lambdaAway: Number(adjustedLambdaAway.toFixed(6)),
      pOver25: Number(adjustedOver25.toFixed(8))
    },
    planCPick: adjustedOver25 >= modelBinding.threshold,
    modelBinding: {
      repositoryBaseHead: modelBinding.repositoryBaseHead,
      identityRegistrySha256: modelBinding.identityRegistrySha256,
      modelSha256: modelBinding.modelSha256,
      teamFormSha256: modelBinding.teamFormSha256,
      eloCoefficient: modelBinding.eloCoefficient,
      threshold: modelBinding.threshold,
      bookmakerOddsUsed: false
    }
  };
  prediction.predictionSignature = planCPredictionSignature(prediction);
  return prediction;
}

export function generatePlanCShadowPredictions(options) {
  const dayKey = clean(options.dayKey);
  assert(/^\d{4}-\d{2}-\d{2}$/u.test(dayKey), `invalid_day_key:${dayKey}`);
  const predictionRoot = options.predictionRoot;
  const truthRoot = options.truthRoot || resolveDataPath("canonical-fixtures");
  const teamFormFile = options.teamFormFile || resolveDataPath("history-index", "team-form", `${options.season || "2026-2027"}.json`);
  const auditFile = options.auditFile || resolveDataPath("plan-c-shadow", "generation", "_audit", `${dayKey}.json`);
  const predictionCreatedAt = clean(options.predictionCreatedAt || new Date().toISOString());
  const predictionCreatedMs = Date.parse(predictionCreatedAt);
  assert(Number.isFinite(predictionCreatedMs), "prediction_created_at_invalid");
  assert(predictionRoot && fs.existsSync(predictionRoot), "prediction_root_missing");
  assert(fs.existsSync(teamFormFile), `team_form_missing:${teamFormFile}`);

  const registry = loadIdentityRegistry(predictionRoot);
  const latestRefreshMs = Date.parse(registry.latestRefreshRetrievedAt);
  assert(latestRefreshMs < predictionCreatedMs, "snapshot_not_before_prediction");
  const snapshotAgeDays = (predictionCreatedMs - latestRefreshMs) / 86400000;
  const maxSnapshotAgeDays = Number(options.maxSnapshotAgeDays ?? DEFAULT_MAX_SNAPSHOT_AGE_DAYS);
  assert(Number.isFinite(maxSnapshotAgeDays) && maxSnapshotAgeDays > 0, "max_snapshot_age_invalid");
  const snapshotFresh = snapshotAgeDays <= maxSnapshotAgeDays;

  const existing = validateExistingBundle(predictionRoot);
  const scanned = scanFixtures({ truthRoot, dayKey, daysForward: Number(options.daysForward ?? 14) });
  const teamForm = readJson(teamFormFile);
  const modelFile = fileURLToPath(new URL("../odds/ai-odds-model.js", import.meta.url));
  const modelBinding = {
    repositoryBaseHead: repositoryHead(),
    identityRegistrySha256: sha256(readUtf8LfBytes(registry.filePath)),
    modelSha256: sha256(readUtf8LfBytes(modelFile)),
    teamFormSha256: sha256(readUtf8LfBytes(teamFormFile)),
    eloCoefficient: Number(options.eloCoefficient ?? DEFAULT_ELO_COEFFICIENT),
    threshold: Number(options.threshold ?? DEFAULT_OVER25_THRESHOLD),
    leagueAvgGoalsPerTeam: Number(options.leagueAvgGoalsPerTeam ?? DEFAULT_LEAGUE_AVG_GOALS_PER_TEAM)
  };

  const terminalStatuses = new Set(["FT", "POSTP", "ABAND", "CANC", "CANCELLED", "SUSP", "WALK", "WO"]);
  const accounting = {
    sourceFiles: scanned.sourceFiles,
    sourceRows: scanned.sourceRows,
    future: 0,
    newBothVerified: 0,
    missingIdentity: 0,
    staleIdentity: 0,
    terminalOrVoid: 0,
    alreadyFrozen: 0,
    added: 0
  };
  const newPredictions = [];
  for (const fixture of scanned.fixtures) {
      if (terminalStatuses.has(fixture.status)) { accounting.terminalOrVoid += 1; continue; }
      if (!(predictionCreatedMs < Date.parse(fixture.kickoffUtc))) continue;
      accounting.future += 1;
      if (existing.seen.has(fixture.canonicalFixtureId)) { accounting.alreadyFrozen += 1; continue; }
      const homeIdentity = registry.map.get(identityKey(fixture.homeTeam, fixture.leagueSlug));
      const awayIdentity = registry.map.get(identityKey(fixture.awayTeam, fixture.leagueSlug));
      if (!homeIdentity || !awayIdentity) { accounting.missingIdentity += 1; continue; }
      const homeSnapshotRetrievedAt = identitySnapshotTime(homeIdentity, registry);
      const awaySnapshotRetrievedAt = identitySnapshotTime(awayIdentity, registry);
      const homeSnapshotMs = Date.parse(homeSnapshotRetrievedAt);
      const awaySnapshotMs = Date.parse(awaySnapshotRetrievedAt);
      const identityTimesValid = [homeSnapshotMs, awaySnapshotMs].every(value => Number.isFinite(value) && value < predictionCreatedMs);
      const identitiesFresh = identityTimesValid
        && (predictionCreatedMs - homeSnapshotMs) / 86400000 <= maxSnapshotAgeDays
        && (predictionCreatedMs - awaySnapshotMs) / 86400000 <= maxSnapshotAgeDays;
      if (!identitiesFresh) { accounting.staleIdentity += 1; continue; }
      accounting.newBothVerified += 1;
      const predictionSnapshotRetrievedAt = homeSnapshotMs >= awaySnapshotMs
        ? homeSnapshotRetrievedAt
        : awaySnapshotRetrievedAt;
      newPredictions.push(buildPrediction({
        fixture,
        homeIdentity,
        awayIdentity,
        teamForm,
        predictionCreatedAt,
        snapshotRetrievedAt: predictionSnapshotRetrievedAt,
        modelBinding
      }));
  }

  for (const prediction of newPredictions) {
    assert(/^cid_[a-z0-9_]+$/u.test(prediction.canonicalFixtureId), `prediction_filename_unsafe:${prediction.canonicalFixtureId}`);
    const filePath = path.join(predictionRoot, "predictions", `${prediction.canonicalFixtureId}.json`);
    assert(!fs.existsSync(filePath), `prediction_overwrite_forbidden:${prediction.canonicalFixtureId}`);
    writeJsonAtomic(filePath, prediction);
  }
  accounting.added = newPredictions.length;

  const allPredictions = existing.predictions.concat(newPredictions)
    .sort((left, right) => left.canonicalFixtureId.localeCompare(right.canonicalFixtureId));
  const index = {
    schema: "ai-matchlab.plan-c-prediction-index.v1",
    accounting: {
      total: allPredictions.length,
      planCPickTrue: allPredictions.filter(item => item.planCPick).length,
      planCPickFalse: allPredictions.filter(item => !item.planCPick).length,
      balanced: true
    },
    predictions: allPredictions.map(prediction => ({
      canonicalFixtureId: prediction.canonicalFixtureId,
      relativePath: `predictions/${prediction.canonicalFixtureId}.json`,
      predictionSignature: prediction.predictionSignature,
      planCPick: prediction.planCPick,
      leagueSlug: prediction.leagueSlug,
      kickoffUtc: prediction.kickoffUtc
    }))
  };
  writeJsonAtomic(path.join(predictionRoot, "PREDICTION_INDEX.json"), index);

  const previousManifestFile = path.join(predictionRoot, "MANIFEST.json");
  const previousManifest = fs.existsSync(previousManifestFile) ? readJson(previousManifestFile) : {};
  const artifactPaths = [
    "IDENTITY_REGISTRY.json",
    "PREDICTION_INDEX.json",
    ...index.predictions.map(item => item.relativePath)
  ].sort();
  const manifest = {
    schema: "ai-matchlab.plan-c-shadow-rolling-bundle.v1",
    sourcePackage: previousManifest.sourcePackage || "AI_MATCHLAB_PDS4C_I2B_CLEAN_20260825",
    sourceManifestSha256: previousManifest.sourceManifestSha256 || previousManifest.sourcePackageManifestSha256 || null,
    sourceAuditSha256: previousManifest.sourceAuditSha256 || null,
    snapshotRetrievedAt: registry.latestRefreshRetrievedAt,
    snapshotAsOf: registry.document?.source?.latestRefreshSnapshotAsOf || registry.document?.source?.snapshotAsOf || null,
    identityRegistrySha256: modelBinding.identityRegistrySha256,
    predictionSetHash: planCPredictionSetHash(index.predictions),
    artifactHashMode: "UTF8_LF_NORMALIZED",
    artifactCount: artifactPaths.length,
    artifacts: artifactPaths.map(relativePath => artifactRecord(predictionRoot, relativePath))
  };
  writeJsonAtomic(previousManifestFile, manifest);

  const audit = {
    schema: "ai-matchlab.plan-c-shadow-generation-audit.v1",
    ok: true,
    date: dayKey,
    generatedAt: new Date().toISOString(),
    mode: "SHADOW",
    productionEligible: false,
    predictionCreatedAt,
    snapshotRetrievedAt: registry.latestRefreshRetrievedAt,
    snapshotAgeDays: Number(snapshotAgeDays.toFixed(6)),
    maxSnapshotAgeDays,
    snapshotFresh,
    staleAction: snapshotFresh ? null : "NO_NEW_PREDICTIONS_WITH_STALE_IDENTITIES",
    window: { start: dayKey, end: addDays(dayKey, Number(options.daysForward ?? 14)) },
    accounting,
    predictionSet: {
      total: index.accounting.total,
      pickCount: index.accounting.planCPickTrue,
      hash: manifest.predictionSetHash
    },
    officialPlansUnaffected: true,
    bookmakerOddsUsed: false
  };
  writeJsonAtomic(auditFile, audit);
  return { manifest, index, audit, newPredictions, auditFile };
}

export function parseGeneratePlanCCli(argv = process.argv.slice(2)) {
  const out = { dayKey: null, predictionRoot: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = clean(argv[index]);
    if (!out.dayKey && /^\d{4}-\d{2}-\d{2}$/u.test(arg)) { out.dayKey = arg; continue; }
    const next = () => { index += 1; const value = clean(argv[index]); if (!value) throw new Error(`missing_value_for:${arg}`); return value; };
    if (arg === "--prediction-root") out.predictionRoot = next();
    else if (arg === "--truth-root") out.truthRoot = next();
    else if (arg === "--team-form") out.teamFormFile = next();
    else if (arg === "--season") out.season = next();
    else if (arg === "--prediction-created-at") out.predictionCreatedAt = next();
    else if (arg === "--days-forward") out.daysForward = Number(next());
    else if (arg === "--max-snapshot-age-days") out.maxSnapshotAgeDays = Number(next());
    else if (arg === "--audit") out.auditFile = next();
    else throw new Error(`unknown_argument:${arg}`);
  }
  return out;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const args = parseGeneratePlanCCli();
    assert(args.dayKey, "missing_day_key");
    assert(args.predictionRoot, "missing_prediction_root");
    const result = generatePlanCShadowPredictions(args);
    console.log(JSON.stringify({
      ok: true,
      mode: "SHADOW",
      date: args.dayKey,
      added: result.audit.accounting.added,
      total: result.index.accounting.total,
      picks: result.index.accounting.planCPickTrue,
      snapshotFresh: result.audit.snapshotFresh,
      predictionSetHash: result.manifest.predictionSetHash
    }, null, 2));
  } catch (error) {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  }
}
