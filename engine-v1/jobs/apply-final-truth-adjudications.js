import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  adjudicationContract,
  validateFinalTruthAdjudication,
} from "../core/final-truth-adjudication.js";
import { sameTeamName } from "../core/fixture-dedup.js";
import { resolveDataPath } from "../storage/data-root.js";
import { getProductionIdentityResolver } from "../core/production-identity-resolver-runtime.js";

const LEDGER_PATH = resolveDataPath("final-truth-adjudications.v1.json");

function clean(value) {
  return String(value ?? "").trim();
}

function strictScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function sha256Buffer(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function rowsWithShape(payload) {
  if (Array.isArray(payload)) return { rows: payload, key: null };
  for (const key of ["fixtures", "matches", "rows"]) {
    if (Array.isArray(payload?.[key])) return { rows: payload[key], key };
  }
  return { rows: [], key: null };
}

function rowId(row) {
  return clean(row?.canonicalId || row?.matchId || row?.id);
}

function locateCanonical(dayKey, matchId, canonicalRoot) {
  const dayDir = path.join(canonicalRoot, dayKey);
  if (!fs.existsSync(dayDir)) return null;
  const found = [];
  for (const name of fs.readdirSync(dayDir).filter(name => name.endsWith(".json")).sort()) {
    const filePath = path.join(dayDir, name);
    const payload = readJson(filePath);
    const shaped = rowsWithShape(payload);
    shaped.rows.forEach((row, index) => {
      if (rowId(row) === matchId) found.push({ filePath, name, payload, key: shaped.key, row, index });
    });
  }
  if (found.length > 1) throw new Error(`adjudication_duplicate_canonical_id:${matchId}`);
  return found[0] || null;
}

function locateFinal(dayKey, matchId, finalRoot) {
  const exactPath = path.join(finalRoot, dayKey, `${matchId}.json`);
  if (fs.existsSync(exactPath)) return { filePath: exactPath, row: readJson(exactPath) };

  const dayDir = path.join(finalRoot, dayKey);
  if (!fs.existsSync(dayDir)) return { filePath: exactPath, row: null };
  const matches = [];
  for (const name of fs.readdirSync(dayDir).filter(name => name.endsWith(".json")).sort()) {
    const filePath = path.join(dayDir, name);
    const row = readJson(filePath);
    if (rowId(row) === matchId) matches.push({ filePath, row });
  }
  if (matches.length > 1) throw new Error(`adjudication_duplicate_final_id:${matchId}`);
  return matches[0] || { filePath: exactPath, row: null };
}

function locateExactFinalAlias(dayKey, matchId, finalRoot) {
  const filePath = path.join(finalRoot, dayKey, `${matchId}.json`);
  return fs.existsSync(filePath)
    ? { filePath, row: readJson(filePath) }
    : { filePath, row: null };
}

function assertTeamPair(adjudication, row, label) {
  if (!row) return;
  const leagueSlug = clean(adjudication?.leagueSlug || row?.leagueSlug);
  const homeMatches = sameTeamName(
    leagueSlug,
    adjudication.homeTeam,
    row?.homeTeam || row?.home,
  );
  const awayMatches = sameTeamName(
    leagueSlug,
    adjudication.awayTeam,
    row?.awayTeam || row?.away,
  );
  if (!homeMatches || !awayMatches) {
    throw new Error(`adjudication_team_pair_mismatch:${label}:${adjudication.matchId}`);
  }
}

function existingScore(row) {
  if (!row) return null;
  const home = strictScore(row?.scoreHome ?? row?.homeScore ?? row?.finalScore?.homeScore ?? row?.finalScore?.home);
  const away = strictScore(row?.scoreAway ?? row?.awayScore ?? row?.finalScore?.awayScore ?? row?.finalScore?.away);
  return home === null || away === null ? null : { home, away, scoreKey: `${home}-${away}` };
}

function canonicalAfter(row, adjudication, contract) {
  return {
    ...row,
    scoreHome: adjudication.homeScore,
    scoreAway: adjudication.awayScore,
    status: "FT",
    rawStatus: "STATUS_FINAL",
    statusType: "STATUS_FINAL",
    operationalState: "TERMINAL_CONFIRMED",
    minute: "FT",
    finalized: 1,
    state: "final",
    isDisplayFinal: true,
    finalTruthAdjudication: contract,
  };
}

function finalAfter(row, adjudication, canonicalRow, contract) {
  const scoreKey = `${adjudication.homeScore}-${adjudication.awayScore}`;
  const kickoffUtc = clean(row?.kickoffUtc || canonicalRow?.kickoffUtc) || null;
  const leagueSlug = clean(row?.leagueSlug || canonicalRow?.leagueSlug);
  const leagueName = clean(row?.leagueName || canonicalRow?.leagueName);
  const country = clean(row?.country || canonicalRow?.country);

  return {
    ...(row || {}),
    schema: "ai-matchlab.verified-final-result.v1",
    verifiedFinalTruth: true,
    date: adjudication.dayKey,
    dayKey: adjudication.dayKey,
    matchId: adjudication.matchId,
    leagueSlug,
    leagueName,
    country,
    homeTeam: adjudication.homeTeam,
    awayTeam: adjudication.awayTeam,
    homeScore: adjudication.homeScore,
    awayScore: adjudication.awayScore,
    scoreHome: adjudication.homeScore,
    scoreAway: adjudication.awayScore,
    finalScore: {
      homeScore: adjudication.homeScore,
      awayScore: adjudication.awayScore,
      home: adjudication.homeScore,
      away: adjudication.awayScore,
      scoreKey,
    },
    scoreKey,
    kickoffUtc,
    finalTruthVerdict: "verified_final_result",
    verdict: "verified_final_result",
    sourceCount: adjudication.evidence.length,
    independentSourceCount: adjudication.evidence.length,
    source: "manual_versioned_truth_adjudication",
    sources: adjudication.evidence.map(evidence => ({ ...evidence })),
    verification: {
      ...(row?.verification || {}),
      verdict: "verified_final_result",
      finalTruthVerdict: "verified_final_result",
      state: "verified_final_result",
      method: "manual_versioned_truth_adjudication",
      authority: "final_truth_adjudication_ledger",
      sourceCount: adjudication.evidence.length,
      independentSourceCount: adjudication.evidence.length,
      adjudicationId: adjudication.adjudicationId,
      generatedAt: contract.appliedAt,
    },
    settlement: {
      ...(row?.settlement || {}),
      finalTruthVerdict: "verified_final_result",
      state: "verified_final_result",
    },
    generatedAt: contract.appliedAt,
    finalTruthAdjudication: contract,
  };
}

function quarantinePaths(adjudicationId, quarantineRoot) {
  const dir = path.join(quarantineRoot, adjudicationId);
  return {
    dir,
    canonicalBefore: path.join(dir, "canonical-before.json"),
    finalBefore: path.join(dir, "final-result-before.json"),
    manifest: path.join(dir, "manifest.json"),
  };
}

function writeQuarantine({ adjudication, canonical, final, quarantineRoot, createdAt }) {
  const paths = quarantinePaths(adjudication.adjudicationId, quarantineRoot);
  if (fs.existsSync(paths.manifest)) {
    const manifest = readJson(paths.manifest);
    if (clean(manifest?.adjudicationId) !== adjudication.adjudicationId) {
      throw new Error(`adjudication_quarantine_identity_mismatch:${adjudication.adjudicationId}`);
    }
    return { paths, existed: true };
  }

  fs.mkdirSync(paths.dir, { recursive: true });
  const manifest = {
    schema: "ai-matchlab.final-truth-adjudication-quarantine.v1",
    adjudicationId: adjudication.adjudicationId,
    createdAt,
    matchId: adjudication.matchId,
    dayKey: adjudication.dayKey,
    canonicalBeforePresent: Boolean(canonical?.row),
    finalBeforePresent: Boolean(final?.row),
    canonicalBeforeSha256: canonical?.row
      ? sha256Buffer(Buffer.from(`${JSON.stringify(canonical.row, null, 2)}\n`, "utf8"))
      : null,
    finalBeforeSha256: final?.row
      ? sha256Buffer(Buffer.from(`${JSON.stringify(final.row, null, 2)}\n`, "utf8"))
      : null,
    reversible: true,
  };
  if (canonical?.row) writeJsonAtomic(paths.canonicalBefore, canonical.row);
  if (final?.row) writeJsonAtomic(paths.finalBefore, final.row);
  writeJsonAtomic(paths.manifest, manifest);
  return { paths, existed: false };
}

export function loadFinalTruthAdjudicationLedger(ledgerPath = LEDGER_PATH) {
  const payload = readJson(ledgerPath);
  const rows = Array.isArray(payload?.adjudications) ? payload.adjudications : [];
  const validated = rows.map(row => validateFinalTruthAdjudication(row));
  const invalid = validated.filter(row => !row.ok);
  if (invalid.length) {
    const error = new Error(`invalid_final_truth_adjudication_ledger:${invalid.length}`);
    error.invalid = invalid;
    throw error;
  }
  const ids = validated.map(row => row.normalized.adjudicationId);
  if (new Set(ids).size !== ids.length) throw new Error("duplicate_final_truth_adjudication_id");
  return { payload, adjudications: validated.map(row => row.normalized) };
}

export function planFinalTruthAdjudications({
  dayKey = "",
  matchId = "",
  ledgerPath = LEDGER_PATH,
  canonicalRoot = resolveDataPath("canonical-fixtures"),
  finalRoot = resolveDataPath("final-results"),
  quarantineRoot = resolveDataPath("quarantine", "final-truth-adjudications"),
  appliedAt = new Date().toISOString(),
} = {}) {
  const { adjudications } = loadFinalTruthAdjudicationLedger(ledgerPath);
  const selected = adjudications.filter(row =>
    (!dayKey || row.dayKey === dayKey) && (!matchId || row.matchId === matchId)
  );
  const actions = [];

  for (const adjudication of selected) {
    const contract = adjudicationContract(adjudication, appliedAt);
    const desiredScore = `${adjudication.homeScore}-${adjudication.awayScore}`;

    if (adjudication?.legacyFinalOnly === true) {
      const final = locateFinal(adjudication.dayKey, adjudication.matchId, finalRoot);
      if (!final?.row) throw new Error(`adjudication_retained_final_missing:${adjudication.matchId}`);
      assertTeamPair(adjudication, final.row, "retained-final");
      const finalScore = existingScore(final.row)?.scoreKey || null;
      if (finalScore !== desiredScore) {
        throw new Error(`adjudication_retained_final_score_mismatch:${adjudication.matchId}:${finalScore}:${desiredScore}`);
      }

      const resolver = getProductionIdentityResolver();
      const aliasIds = Array.isArray(adjudication?.conflictingAliasMatchIds)
        ? adjudication.conflictingAliasMatchIds.map(clean).filter(Boolean)
        : [];
      if (!aliasIds.length) throw new Error(`adjudication_legacy_aliases_required:${adjudication.matchId}`);
      const aliases = aliasIds.map(aliasId => {
        const resolution = resolver.resolveFixtureId(aliasId);
        if (!resolution?.ok || clean(resolution.resolvedFixtureId) !== adjudication.matchId || resolution.sourceRole !== "suppressed_lineage_alias") {
          throw new Error(`adjudication_legacy_alias_lineage_invalid:${aliasId}`);
        }
        const alias = locateExactFinalAlias(adjudication.dayKey, aliasId, finalRoot);
        const aliasScore = existingScore(alias.row)?.scoreKey || null;
        if (alias.row && aliasScore === desiredScore) {
          throw new Error(`adjudication_legacy_alias_not_conflicting:${aliasId}`);
        }
        return { aliasId, resolution, ...alias, scoreKey: aliasScore };
      });
      const aliasesRemaining = aliases.filter(row => row.row);
      const alreadyApplied =
        clean(final.row?.finalTruthAdjudication?.adjudicationId) === adjudication.adjudicationId &&
        aliasesRemaining.length === 0;
      actions.push({
        kind: "LEGACY_FINAL_ALIAS_CONFLICT",
        adjudication,
        canonical: null,
        final,
        aliases,
        contract,
        canonicalBeforeScore: null,
        finalBeforeScore: finalScore,
        desiredScore,
        alreadyApplied,
        quarantine: quarantinePaths(adjudication.adjudicationId, quarantineRoot),
      });
      continue;
    }

    const canonical = locateCanonical(adjudication.dayKey, adjudication.matchId, canonicalRoot);
    if (!canonical) throw new Error(`adjudication_canonical_missing:${adjudication.matchId}`);
    const final = locateFinal(adjudication.dayKey, adjudication.matchId, finalRoot);
    assertTeamPair(adjudication, canonical.row, "canonical");
    assertTeamPair(adjudication, final.row, "final");
    const canonicalScore = existingScore(canonical.row)?.scoreKey || null;
    const finalScore = existingScore(final.row)?.scoreKey || null;
    const alreadyApplied =
      clean(canonical.row?.finalTruthAdjudication?.adjudicationId) === adjudication.adjudicationId &&
      clean(final.row?.finalTruthAdjudication?.adjudicationId) === adjudication.adjudicationId &&
      canonicalScore === desiredScore &&
      finalScore === desiredScore;

    actions.push({
      kind: "CANONICAL_AND_FINAL",
      adjudication,
      canonical,
      final,
      contract,
      canonicalBeforeScore: canonicalScore,
      finalBeforeScore: finalScore,
      desiredScore,
      alreadyApplied,
      quarantine: quarantinePaths(adjudication.adjudicationId, quarantineRoot),
    });
  }

  return {
    schema: "ai-matchlab.final-truth-adjudication-plan.v1",
    generatedAt: appliedAt,
    selectedCount: selected.length,
    pendingCount: actions.filter(row => !row.alreadyApplied).length,
    alreadyAppliedCount: actions.filter(row => row.alreadyApplied).length,
    actions,
  };
}

export function applyFinalTruthAdjudications(options = {}) {
  const plan = planFinalTruthAdjudications(options);
  if (options.write !== true) return { ...plan, writeApplied: false };
  let filesWritten = 0;

  for (const action of plan.actions) {
    if (action.alreadyApplied) continue;
    const { adjudication, canonical, final, contract } = action;
    const quarantineRoot = options.quarantineRoot || resolveDataPath("quarantine", "final-truth-adjudications");

    if (action.kind === "LEGACY_FINAL_ALIAS_CONFLICT") {
      const q = writeQuarantine({
        adjudication,
        canonical: null,
        final,
        quarantineRoot,
        createdAt: contract.appliedAt,
      });
      for (const alias of action.aliases || []) {
        if (!alias.row) continue;
        const aliasQuarantinePath = path.join(q.paths.dir, `suppressed-alias-${alias.aliasId}.json`);
        if (!fs.existsSync(aliasQuarantinePath)) writeJsonAtomic(aliasQuarantinePath, alias.row);
      }
      const retained = {
        ...final.row,
        finalTruthAdjudication: contract,
        legacyAliasConflictResolution: {
          schema: "ai-matchlab.legacy-final-alias-conflict-resolution.v1",
          adjudicationId: adjudication.adjudicationId,
          retainedFixtureId: adjudication.matchId,
          quarantinedAliasFixtureIds: (action.aliases || []).map(row => row.aliasId),
          scoreTruthChanged: false,
          resolvedAt: contract.appliedAt,
        },
      };
      writeJsonAtomic(final.filePath, retained);
      filesWritten += 1;
      for (const alias of action.aliases || []) {
        if (alias.row) fs.rmSync(alias.filePath, { force: true });
      }
      continue;
    }

    writeQuarantine({
      adjudication,
      canonical,
      final,
      quarantineRoot,
      createdAt: contract.appliedAt,
    });

    const canonicalPayload = readJson(canonical.filePath);
    const shaped = rowsWithShape(canonicalPayload);
    const current = shaped.rows[canonical.index];
    if (rowId(current) !== adjudication.matchId) {
      throw new Error(`adjudication_prewrite_canonical_changed:${adjudication.matchId}`);
    }
    shaped.rows[canonical.index] = canonicalAfter(current, adjudication, contract);
    if (!Array.isArray(canonicalPayload)) {
      canonicalPayload[canonical.key] = shaped.rows;
      if (Object.prototype.hasOwnProperty.call(canonicalPayload, "count")) {
        canonicalPayload.count = shaped.rows.length;
      }
      canonicalPayload.updatedAt = contract.appliedAt;
    }
    writeJsonAtomic(canonical.filePath, canonicalPayload);
    filesWritten += 1;

    const afterFinal = finalAfter(final.row, adjudication, canonical.row, contract);
    writeJsonAtomic(final.filePath, afterFinal);
    filesWritten += 1;
  }

  return { ...plan, writeApplied: true, filesWritten };
}

function parseArgs(argv) {
  const out = { dayKey: "", matchId: "", write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (/^\d{4}-\d{2}-\d{2}$/u.test(token)) out.dayKey = token;
    else if (token === "--write") out.write = true;
    else if (token === "--match") out.matchId = clean(argv[index += 1]);
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = applyFinalTruthAdjudications({
      dayKey: args.dayKey,
      matchId: args.matchId,
      write: args.write,
    });
    console.log(JSON.stringify(result, (key, value) => {
      if (["payload", "canonical", "final", "contract"].includes(key)) return undefined;
      return value;
    }, 2));
  } catch (error) {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  }
}
