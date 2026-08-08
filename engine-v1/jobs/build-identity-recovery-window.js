/**
 * Persist the identity-extension recovery view over the acquisition window.
 *
 * This job deliberately reads raw canonical-fixture league files before the
 * served-universe de-duplication layer. Unknown cross-provider aliases must be
 * observable here; otherwise a successful runtime de-dup could hide the very
 * identity evidence needed for a durable future promotion.
 *
 * Output: data/identity-recovery/<runDayKey>.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { shiftDay } from "../core/daykey.js";
import { discoverIdentityRecoveryCandidates } from "../core/identity-extension-recovery.js";
import { getProductionIdentityResolverRuntime } from "../core/production-identity-resolver-runtime.js";
import { isDisabledLeague } from "../source-discovery/disabled-leagues.js";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/u;

function integer(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function readFixtureFile(filePath) {
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`identity_recovery_invalid_fixture_file:${filePath}:${error.message}`);
  }
  if (!payload || !Array.isArray(payload.fixtures)) {
    throw new Error(`identity_recovery_invalid_fixture_shape:${filePath}`);
  }
  return payload;
}

function addSummary(target, source) {
  for (const key of [
    "autoPromotable",
    "pendingIndependentConfirmation",
    "ambiguous",
    "conflictRejected",
    "alreadyManagedPairs",
  ]) {
    target[key] += Number(source?.[key] || 0);
  }
}

function hasRecoverySignal(summary) {
  return Boolean(
    summary?.autoPromotable ||
    summary?.pendingIndependentConfirmation ||
    summary?.ambiguous ||
    summary?.conflictRejected ||
    summary?.alreadyManagedPairs
  );
}

function sourceUpdatedAt(payload) {
  const value = String(payload?.updatedAt || "").trim();
  return Number.isFinite(Date.parse(value)) ? value : null;
}

export function buildIdentityRecoveryWindow(
  runDayKey,
  {
    daysBack = 1,
    daysForward = 14,
    canonicalRoot = resolveDataPath("canonical-fixtures"),
    outputRoot = resolveDataPath("identity-recovery"),
    resolverRuntime = null,
    write = true,
  } = {},
) {
  const safeRunDay = String(runDayKey || "").trim();
  if (!DAY_RE.test(safeRunDay)) {
    throw new Error(`identity_recovery_invalid_day:${safeRunDay}`);
  }

  const back = integer(daysBack, 1);
  const forward = integer(daysForward, 14);
  const runtime = resolverRuntime || getProductionIdentityResolverRuntime();
  const resolver = runtime?.resolver;
  if (!resolver) throw new Error("identity_recovery_resolver_unavailable");

  const totals = {
    autoPromotable: 0,
    pendingIndependentConfirmation: 0,
    ambiguous: 0,
    conflictRejected: 0,
    alreadyManagedPairs: 0,
  };
  let scannedLeagueFiles = 0;
  let inputRows = 0;
  const targetDays = [];
  const updateTimes = [];

  for (let offset = -back; offset <= forward; offset += 1) {
    const dayKey = shiftDay(safeRunDay, offset);
    const dayDir = path.join(canonicalRoot, dayKey);
    if (!fs.existsSync(dayDir)) continue;

    const leagueReports = [];
    const names = fs.readdirSync(dayDir)
      .filter(name => name.endsWith(".json"))
      .sort();

    for (const name of names) {
      const filePath = path.join(dayDir, name);
      const slugFromFile = path.basename(name, ".json");
      if (isDisabledLeague(slugFromFile)) continue;

      const payload = readFixtureFile(filePath);
      const leagueSlug = String(payload.leagueSlug || slugFromFile).trim();
      if (leagueSlug !== slugFromFile) {
        throw new Error(`identity_recovery_league_slug_mismatch:${filePath}:${leagueSlug}`);
      }
      const updatedAt = sourceUpdatedAt(payload);
      if (updatedAt) updateTimes.push(updatedAt);

      const report = discoverIdentityRecoveryCandidates(payload.fixtures, {
        leagueSlug,
        resolver,
      });
      scannedLeagueFiles += 1;
      inputRows += report.inputRows;
      addSummary(totals, report.summary);

      if (hasRecoverySignal(report.summary)) {
        leagueReports.push({
          leagueSlug,
          inputRows: report.inputRows,
          temporalCrossProviderPairs: report.temporalCrossProviderPairs,
          autoPromotable: report.autoPromotable,
          pendingIndependentConfirmation: report.pendingIndependentConfirmation,
          ambiguous: report.ambiguous,
          conflictRejected: report.conflictRejected,
          summary: report.summary,
        });
      }
    }

    targetDays.push({
      dayKey,
      leagueFiles: names.length,
      recoveryLeagueReports: leagueReports,
    });
  }

  const status = totals.conflictRejected > 0 ||
    totals.pendingIndependentConfirmation > 0 ||
    totals.ambiguous > 0
    ? "REVIEW_REQUIRED"
    : totals.autoPromotable > 0
      ? "AUTO_PROMOTION_READY"
      : "CLEAN";
  const sortedUpdateTimes = updateTimes.sort((a, b) => Date.parse(a) - Date.parse(b));

  const artifact = {
    schema: "ai-matchlab.identity-recovery-window.v1",
    runDayKey: safeRunDay,
    source: "raw_canonical_fixtures_pre_dedup",
    window: { daysBack: back, daysForward: forward },
    sourceLatestUpdatedAt: sortedUpdateTimes.at(-1) || null,
    resolver: {
      schema: runtime.schema || null,
      extensionLedgerSha256: runtime.hashes?.extensionLedger || null,
      effectiveCounts: runtime.effectiveCounts || null,
    },
    status,
    promotionPolicy: {
      broadFuzzyAllowed: false,
      unresolvedTwoSidedAutoPromotionAllowed: false,
      independentConfirmationRequiredForTwoSidedUnknown: true,
    },
    summary: {
      scannedDays: targetDays.length,
      scannedLeagueFiles,
      inputRows,
      ...totals,
    },
    targetDays,
  };

  const outputPath = path.join(outputRoot, `${safeRunDay}.json`);
  if (write) {
    ensureDir(outputRoot);
    const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
    if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf8") !== serialized) {
      fs.writeFileSync(outputPath, serialized, "utf8");
    }
  }

  return { artifact, outputPath };
}

function parseArgs(argv) {
  const positional = argv.find(arg => !arg.startsWith("--")) || "";
  const valueOf = (name, fallback) => {
    const equals = argv.find(arg => arg.startsWith(`--${name}=`));
    if (equals) return equals.slice(name.length + 3);
    const index = argv.indexOf(`--${name}`);
    return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
  };
  return {
    runDayKey: positional,
    daysBack: integer(valueOf("days-back", 1), 1),
    daysForward: integer(valueOf("days-forward", 14), 14),
  };
}

const isMain = process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = buildIdentityRecoveryWindow(args.runDayKey, args);
    console.log(JSON.stringify({
      outputPath: result.outputPath,
      status: result.artifact.status,
      summary: result.artifact.summary,
    }, null, 2));
  } catch (error) {
    console.error("[identity-recovery-window] failed", error);
    process.exitCode = 1;
  }
}
