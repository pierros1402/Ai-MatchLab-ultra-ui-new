import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PLAN_A_OBSERVATION_START_DAY,
  readPlanAObservationDay
} from "../value/plan-a-observation.js";

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

function clean(value) {
  return String(value ?? "").trim();
}

function summarizeComparisonRows(rows) {
  const safeRows =
    Array.isArray(rows)
      ? rows
      : [];

  const picks =
    safeRows.length;

  const uniqueMatches =
    new Set(
      safeRows
        .map(row => row?.matchId)
        .filter(Boolean)
    ).size;

  const settledRows =
    safeRows.filter(
      row =>
        row?.result === "WIN" ||
        row?.result === "LOSS"
    );

  const wins =
    safeRows.filter(
      row => row?.result === "WIN"
    ).length;

  const losses =
    safeRows.filter(
      row => row?.result === "LOSS"
    ).length;

  const voids =
    safeRows.filter(
      row => row?.result === "VOID"
    ).length;

  const unresolved =
    safeRows.filter(
      row => row?.result === "UNRESOLVED"
    ).length;

  const unsupported =
    safeRows.filter(
      row => row?.result === "UNSUPPORTED"
    ).length;

  const oddsRows =
    settledRows.filter(
      row =>
        Number.isFinite(
          row?.oddsDecimal
        ) &&
        row.oddsDecimal > 1
    );

  const totalStake =
    oddsRows.length;

  const totalReturn =
    oddsRows.reduce(
      (sum, row) =>
        sum +
        (
          row.result === "WIN"
            ? row.oddsDecimal
            : 0
        ),
      0
    );

  const profit =
    oddsRows.length
      ? totalReturn - totalStake
      : null;

  return {
    picks,
    uniqueMatches,

    settled:
      settledRows.length,

    wins,
    losses,
    voids,
    unresolved,
    unsupported,

    hitRate:
      settledRows.length
        ? Number(
            (
              wins /
              settledRows.length
            ).toFixed(4)
          )
        : null,

    oddsAvailable:
      oddsRows.length,

    averageOdds:
      oddsRows.length
        ? Number(
            (
              oddsRows.reduce(
                (sum, row) =>
                  sum +
                  row.oddsDecimal,
                0
              ) /
              oddsRows.length
            ).toFixed(4)
          )
        : null,

    totalStake:
      oddsRows.length
        ? totalStake
        : null,

    totalReturn:
      oddsRows.length
        ? Number(
            totalReturn.toFixed(4)
          )
        : null,

    profit:
      profit === null
        ? null
        : Number(
            profit.toFixed(4)
          ),

    roi:
      profit === null
        ? null
        : Number(
            (
              profit /
              totalStake
            ).toFixed(4)
          )
  };
}

function normalizedRepoPath(value) {
  return clean(value)
    .replaceAll("\\", "/");
}

function comparisonFingerprint(
  dayKey,
  plan,
  row
) {
  return [
    clean(dayKey),
    clean(plan),

    clean(
      row?.canonicalMatchId ||
      row?.matchId
    ),

    clean(row?.market),
    clean(row?.pick)
  ].join("|");
}

function validateHistoricalExclusionsLedger(
  payload,
  file
) {
  if (
    payload?.ok !== true ||
    payload?.schema !==
      "ai-matchlab.historical-value-statistics-exclusions.v1" ||
    payload?.status !== "active" ||
    !Array.isArray(payload?.entries)
  ) {
    throw new Error(
      "historical_exclusion_ledger_invalid"
    );
  }

  const contract =
    payload.contract || {};

  if (
    contract.applicationLayer !==
      "derived_statistics_only" ||

    contract
      .frozenObservationArtifactsImmutable !==
      true ||

    contract.retrospectiveValueRebuild !==
      false ||

    contract.exactIdentityOnly !==
      true ||

    contract.fuzzyMatching !==
      false ||

    contract.teamNameMatching !==
      false ||

    contract.kickoffHeuristic !==
      false ||

    contract.exclusionReason !==
      "minimum_recent_sample" ||

    Number(
      contract
        .minimumRequiredRecentMatches
    ) !== 3
  ) {
    throw new Error(
      "historical_exclusion_contract_invalid"
    );
  }

  const entries =
    payload.entries;

  const seenIds =
    new Set();

  const seenSlots =
    new Set();

  const byDay =
    new Map();

  for (const entry of entries) {
    const exclusionId =
      clean(entry?.exclusionId);

    const dayKey =
      clean(entry?.day);

    const plan =
      clean(entry?.plan);

    const pickIndex =
      Number(
        entry?.comparison?.pickIndex
      );

    if (
      !exclusionId ||
      !/^\d{4}-\d{2}-\d{2}$/u
        .test(dayKey) ||
      !["A", "A2"].includes(plan) ||
      !Number.isInteger(pickIndex) ||
      pickIndex < 0 ||
      !clean(
        entry?.source?.fingerprint
      )
    ) {
      throw new Error(
        "historical_exclusion_entry_invalid"
      );
    }

    const expectedComparisonFile =
      `data/value-comparison/${dayKey}.json`;

    if (
      normalizedRepoPath(
        entry?.comparison?.file
      ) !== expectedComparisonFile
    ) {
      throw new Error(
        `historical_exclusion_comparison_file_invalid:${exclusionId}`
      );
    }

    if (
      entry?.exclusion?.reason !==
        "minimum_recent_sample" ||

      entry?.exclusion
        ?.statisticalOnly !== true ||

      entry?.exclusion
        ?.frozenObservationMutated !==
        false
    ) {
      throw new Error(
        `historical_exclusion_semantics_invalid:${exclusionId}`
      );
    }

    const minimumRequired =
      Number(
        entry
          ?.eligibilityEvidence
          ?.minimumRequired
      );

    const homeSample =
      Number(
        entry
          ?.eligibilityEvidence
          ?.homeSample
      );

    const awaySample =
      Number(
        entry
          ?.eligibilityEvidence
          ?.awaySample
      );

    if (
      minimumRequired !== 3 ||
      !Number.isFinite(homeSample) ||
      !Number.isFinite(awaySample) ||
      (
        homeSample >=
          minimumRequired &&
        awaySample >=
          minimumRequired
      )
    ) {
      throw new Error(
        `historical_exclusion_eligibility_invalid:${exclusionId}`
      );
    }

    if (seenIds.has(exclusionId)) {
      throw new Error(
        `historical_exclusion_duplicate_id:${exclusionId}`
      );
    }

    seenIds.add(exclusionId);

    const slot =
      `${dayKey}|${plan}|${pickIndex}`;

    if (seenSlots.has(slot)) {
      throw new Error(
        `historical_exclusion_duplicate_slot:${slot}`
      );
    }

    seenSlots.add(slot);

    if (!byDay.has(dayKey)) {
      byDay.set(
        dayKey,
        []
      );
    }

    byDay
      .get(dayKey)
      .push(entry);
  }

  const planACount =
    entries.filter(
      row => row?.plan === "A"
    ).length;

  const planA2Count =
    entries.filter(
      row => row?.plan === "A2"
    ).length;

  const affectedDays =
    [...byDay.keys()]
      .sort();

  const declaredDays =
    Array.isArray(
      payload?.affectedDays
    )
      ? payload.affectedDays
          .map(clean)
          .sort()
      : [];

  if (
    Number(
      payload?.counts?.entries
    ) !== entries.length ||

    Number(
      payload?.counts?.planA
    ) !== planACount ||

    Number(
      payload?.counts?.planA2
    ) !== planA2Count ||

    Number(
      payload?.counts?.planB
    ) !== 0 ||

    Number(
      payload?.counts?.planB2
    ) !== 0 ||

    Number(
      payload?.counts?.affectedDays
    ) !== affectedDays.length ||

    JSON.stringify(declaredDays) !==
      JSON.stringify(affectedDays)
  ) {
    throw new Error(
      "historical_exclusion_counts_invalid"
    );
  }

  return {
    active: true,
    file,
    payload,
    entries,
    byDay,
    planACount,
    planA2Count,
    affectedDays
  };
}

function loadHistoricalExclusionsLedger(
  file,
  required
) {
  if (!fs.existsSync(file)) {
    if (required) {
      throw new Error(
        `historical_exclusion_ledger_missing:${file}`
      );
    }

    return {
      active: false,
      file,
      payload: null,
      entries: [],
      byDay: new Map(),
      planACount: 0,
      planA2Count: 0,
      affectedDays: []
    };
  }

  const payload =
    readJsonSafe(
      file,
      null
    );

  return validateHistoricalExclusionsLedger(
    payload,
    file
  );
}

function validateHistoricalEntriesForDay(
  dayKey,
  payload,
  entries,
  resolvedIds
) {
  const planAIndices =
    new Set();

  let planA2Validated =
    0;

  for (const entry of entries) {
    const plan =
      entry.plan;

    const pickIndex =
      Number(
        entry.comparison.pickIndex
      );

    const picks =
      payload
        ?.plans
        ?.[plan]
        ?.picks;

    if (
      !Array.isArray(picks) ||
      pickIndex >= picks.length
    ) {
      throw new Error(
        `historical_exclusion_pick_missing:${entry.exclusionId}`
      );
    }

    const row =
      picks[pickIndex];

    const actualFingerprint =
      comparisonFingerprint(
        dayKey,
        plan,
        row
      );

    if (
      actualFingerprint !==
      clean(
        entry
          ?.source
          ?.fingerprint
      )
    ) {
      throw new Error(
        `historical_exclusion_fingerprint_mismatch:${entry.exclusionId}`
      );
    }

    const expectedMatchId =
      clean(
        entry
          ?.comparison
          ?.matchId
      );

    const expectedCanonicalId =
      clean(
        entry
          ?.comparison
          ?.canonicalMatchId
      );

    const expectedMarket =
      clean(
        entry
          ?.comparison
          ?.market
      );

    const expectedPick =
      clean(
        entry
          ?.comparison
          ?.pick
      );

    if (
      (
        expectedMatchId &&
        clean(row?.matchId) !==
          expectedMatchId
      ) ||
      (
        expectedCanonicalId &&
        clean(
          row?.canonicalMatchId
        ) !==
          expectedCanonicalId
      ) ||
      clean(row?.market) !==
        expectedMarket ||
      clean(row?.pick) !==
        expectedPick
    ) {
      throw new Error(
        `historical_exclusion_exact_identity_mismatch:${entry.exclusionId}`
      );
    }

    if (
      resolvedIds.has(
        entry.exclusionId
      )
    ) {
      throw new Error(
        `historical_exclusion_resolved_twice:${entry.exclusionId}`
      );
    }

    resolvedIds.add(
      entry.exclusionId
    );

    if (plan === "A") {
      planAIndices.add(
        pickIndex
      );
    } else {
      planA2Validated += 1;
    }
  }

  return {
    planAIndices,

    planACount:
      planAIndices.size,

    planA2Validated,

    total:
      entries.length
  };
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
  "voids",
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

function readBuildReport(day) {
  return readJsonSafe(dataPath("build-reports", `${day}.json`), null);
}

function dayIsIntegrityClean(day) {
  const buildReport = readBuildReport(day);
  if (!buildReport) {
    return { ok: false, reason: "build_report_missing" };
  }
  if (buildReport.clean !== true) {
    return {
      ok: false,
      reason: "build_report_not_clean",
      hardFailures: buildReport.hardFailures || []
    };
  }

  const invariant = readJsonSafe(dataPath("deploy-snapshots", day, "invariant-report.json"), null);
  const manifest = readJsonSafe(dataPath("deploy-snapshots", day, "manifest.json"), null);
  if (!invariant) return { ok: false, reason: "invariant_report_missing" };

  const checkedAt = Date.parse(invariant.checkedAt || "");
  const generatedAt = Date.parse(manifest?.generatedAt || "");
  if (!Number.isFinite(checkedAt) || (Number.isFinite(generatedAt) && checkedAt < generatedAt)) {
    return {
      ok: false,
      reason: "invariant_report_stale",
      checkedAt: invariant.checkedAt || null,
      manifestGeneratedAt: manifest?.generatedAt || null
    };
  }

  if (invariant.ok === false || (Array.isArray(invariant.blocked) && invariant.blocked.length > 0)) {
    return { ok: false, reason: "invariant_blocked", blocked: invariant.blocked || [] };
  }

  const rescuedCount = Number(manifest?.snapshotRescuedCount || 0);
  if (rescuedCount > 0) {
    return {
      ok: false,
      reason: "snapshot_rescue_present",
      snapshotRescuedCount: rescuedCount,
      snapshotRescuedLeagues: manifest?.snapshotRescuedLeagues || []
    };
  }

  return { ok: true };
}

export function buildValueComparisonCumulative(options = {}) {
  const dir = options.dir || dataPath("value-comparison");
  const outputPath = options.output || path.join(dir, "cumulative.json");
  const trialStartDay = String(options.trialStartDay || PLAN_A_OBSERVATION_START_DAY);

  const productionComparisonDir =
    path.resolve(
      dataPath("value-comparison")
    );

  const requireHistoricalExclusions =
    options.requireHistoricalExclusions ===
      undefined
      ? path.resolve(dir) ===
          productionComparisonDir
      : options.requireHistoricalExclusions ===
          true;

  const historicalExclusionsFile =
    options.historicalExclusionsFile ||
    path.join(
      dir,
      "historical-exclusions.json"
    );

  const historicalExclusions =
    loadHistoricalExclusionsLedger(
      historicalExclusionsFile,
      requireHistoricalExclusions
    );

  const days = listComparisonDays(dir).filter(day => day >= trialStartDay);

  const totalsA = emptyTotals();
  const totalsB = emptyTotals();
  const daysIncluded = [];
  const daysExcluded = [];
  const integrityDiagnostics = [];

  const resolvedHistoricalExclusionIds =
    new Set();

  const statisticsCorrectedDays =
    new Set();

  let validatedPlanAExclusions =
    0;

  let validatedPlanA2Exclusions =
    0;

  let appliedPlanAExclusions =
    0;

  const requireIntegrityClean = options.requireIntegrityClean === true;
  const requireImmutablePlanA = options.requireImmutablePlanA !== false;
  let planAMeta = { id: "plan-a", label: "Plan A - frozen production observation" };
  let planBMeta = { id: "plan-b", label: "Plan B - strict value-policy-v2.3 observation" };

  for (const day of days) {
    const payload = readJsonSafe(path.join(dir, `${day}.json`), null);

    const historicalEntriesForDay =
      historicalExclusions.byDay.get(day) ||
      [];

    if (
      historicalEntriesForDay.length > 0 &&
      payload?.comparisonEligible === false
    ) {
      throw new Error(
        `historical_exclusion_day_became_ineligible:${day}`
      );
    }

    const historicalDay =
      validateHistoricalEntriesForDay(
        day,
        payload,
        historicalEntriesForDay,
        resolvedHistoricalExclusionIds
      );

    validatedPlanAExclusions +=
      historicalDay.planACount;

    validatedPlanA2Exclusions +=
      historicalDay.planA2Validated;

    if (
      payload?.comparisonEligible === false
    ) {
      daysExcluded.push({
        dayKey: day,
        reason:
          payload?.planAAvailability?.reason ||
          payload?.planBAvailability?.reason ||
          "comparison_ineligible",
        details: {
          comparisonEligible: false,
          planAAvailability:
            payload?.planAAvailability ||
            null,
          planBAvailability:
            payload?.planBAvailability ||
            null,
          planBPickCount:
            Number(
              payload?.plans?.B
                ?.summary?.picks ||
              payload?.plans?.B
                ?.count ||
              0
            )
        }
      });

      continue;
    }

    let A =
      payload?.plans?.A?.summary;

    const B =
      payload?.plans?.B?.summary;

    if (!A || !B) {
      if (historicalDay.total > 0) {
        throw new Error(
          `historical_exclusion_comparison_plans_missing:${day}`
        );
      }

      daysExcluded.push({
        dayKey: day,
        reason:
          "comparison_plans_missing"
      });

      continue;
    }

    if (
      historicalDay.planAIndices.size >
      0
    ) {
      const planAPicks =
        payload?.plans?.A?.picks;

      if (!Array.isArray(planAPicks)) {
        throw new Error(
          `historical_exclusion_plan_a_picks_missing:${day}`
        );
      }

      const correctedPlanAPicks =
        planAPicks.filter(
          (_row, index) =>
            !historicalDay
              .planAIndices
              .has(index)
        );

      A =
        summarizeComparisonRows(
          correctedPlanAPicks
        );
    }

    if (requireImmutablePlanA) {
      const contractImmutable = payload?.sourceContract?.planAImmutable === true;
      const planImmutable = payload?.plans?.A?.immutable === true;
      const observation = readPlanAObservationDay(day);
      if (!contractImmutable || !planImmutable || !observation.ok) {
        if (historicalDay.total > 0) {
          throw new Error(
            `historical_exclusion_immutable_plan_a_invalid:${day}`
          );
        }

        daysExcluded.push({
          dayKey: day,
          reason: "immutable_plan_a_observation_invalid",
          details: {
            contractImmutable,
            planImmutable,
            observationReason: observation.reason || null,
            observationFile: observation.file || null
          }
        });
        continue;
      }
    }

    const integrity = dayIsIntegrityClean(day);
    if (!integrity.ok) {
      integrityDiagnostics.push({ dayKey: day, reason: integrity.reason, details: integrity });
      if (requireIntegrityClean) {
        daysExcluded.push({ dayKey: day, reason: integrity.reason, details: integrity });
        continue;
      }
    }

    addInto(totalsA, A);
    addInto(totalsB, B);
    daysIncluded.push(day);

    if (
      historicalDay.planACount > 0
    ) {
      appliedPlanAExclusions +=
        historicalDay.planACount;

      statisticsCorrectedDays.add(
        day
      );
    }

    if (payload?.plans?.A?.id) planAMeta = { id: payload.plans.A.id, label: payload.plans.A.label };
    if (payload?.plans?.B?.id) planBMeta = { id: payload.plans.B.id, label: payload.plans.B.label };
  }

  if (
    historicalExclusions.active &&
    resolvedHistoricalExclusionIds.size !==
      historicalExclusions.entries.length
  ) {
    const unresolved =
      historicalExclusions.entries
        .filter(
          entry =>
            !resolvedHistoricalExclusionIds
              .has(entry.exclusionId)
        )
        .map(
          entry =>
            entry.exclusionId
        );

    throw new Error(
      `historical_exclusion_entries_unresolved:${unresolved.join(",")}`
    );
  }

  if (
    historicalExclusions.active &&
    (
      validatedPlanAExclusions !==
        historicalExclusions.planACount ||

      validatedPlanA2Exclusions !==
        historicalExclusions.planA2Count ||

      appliedPlanAExclusions !==
        historicalExclusions.planACount
    )
  ) {
    throw new Error(
      "historical_exclusion_application_count_mismatch"
    );
  }

  const finalA = finalizeTotals(totalsA);
  const finalB = finalizeTotals(totalsB);

  const payload = {
    ok: true,
    schema: "ai-matchlab.value-plan-comparison-cumulative.v1",
    generatedAt: new Date().toISOString(),
    note: "Rolled-up immutable Plan A vs Plan B observations for the full trial window. Historical minimum-sample exclusions are applied only to derived statistics; frozen observations remain immutable. Snapshot-integrity warnings remain diagnostics.",

    historicalStatisticsCorrection: {
      active:
        historicalExclusions.active,

      ledgerSchema:
        historicalExclusions
          .payload?.schema ||
        null,

      ledgerPath:
        historicalExclusions.active
          ? normalizedRepoPath(
              path.relative(
                ROOT,
                historicalExclusions.file
              )
            )
          : null,

      ledgerEntryCount:
        historicalExclusions
          .entries.length,

      resolvedLedgerEntries:
        resolvedHistoricalExclusionIds
          .size,

      validatedPlanAExclusions,

      validatedPlanA2Exclusions,

      appliedPlanAExclusions,

      ledgerAffectedDays:
        historicalExclusions
          .affectedDays,

      statisticsCorrectedDays:
        [...statisticsCorrectedDays]
          .sort(),

      frozenObservationArtifactsImmutable:
        historicalExclusions
          .payload?.contract
          ?.frozenObservationArtifactsImmutable ===
        true,

      retrospectiveValueRebuild:
        historicalExclusions
          .payload?.contract
          ?.retrospectiveValueRebuild ??
        null,

      exactIdentityOnly:
        historicalExclusions
          .payload?.contract
          ?.exactIdentityOnly ===
        true,

      fuzzyMatching:
        historicalExclusions
          .payload?.contract
          ?.fuzzyMatching ??
        null,

      correctedStatisticalPopulation:
        Number.isFinite(
          Number(
            historicalExclusions
              .payload?.provenance
              ?.correctedStatisticalPopulation
          )
        )
          ? Number(
              historicalExclusions
                .payload?.provenance
                ?.correctedStatisticalPopulation
            )
          : null
    },

    trialStartDay,
    dayCount: daysIncluded.length,
    firstDay: daysIncluded[0] || null,
    lastDay: daysIncluded[daysIncluded.length - 1] || null,
    requireIntegrityClean,
    requireImmutablePlanA,
    daysIncluded,
    daysExcluded,
    excludedDayCount: daysExcluded.length,
    integrityDiagnostics,
    integrityWarningDayCount: integrityDiagnostics.length,
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
  const out = {
    write: false,
    requireIntegrityClean: false,
    requireImmutablePlanA: true,
    trialStartDay: PLAN_A_OBSERVATION_START_DAY
  };
  for (const arg of argv) {
    if (arg === "--write") out.write = true;
    else if (arg === "--require-integrity-clean") out.requireIntegrityClean = true;
    else if (arg === "--include-unclean") out.requireIntegrityClean = false;
    else if (arg === "--allow-non-immutable-plan-a") out.requireImmutablePlanA = false;
    else if (arg.startsWith("--trial-start=")) out.trialStartDay = arg.slice("--trial-start=".length);
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
      excludedDayCount: result.payload.excludedDayCount,
      firstDay: result.payload.firstDay,
      lastDay: result.payload.lastDay,
      planA: result.payload.plans.A.totals,
      planB: result.payload.plans.B.totals,
      comparison: result.payload.comparison,

      historicalStatisticsCorrection:
        result.payload
          .historicalStatisticsCorrection,

      written: options.write ? result.outputPath : "(dry-run, pass --write)"
    })
  );
}
