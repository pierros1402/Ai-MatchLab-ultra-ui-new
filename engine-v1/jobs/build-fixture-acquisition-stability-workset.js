import fs from "node:fs";
import path from "node:path";

import { LEAGUES_COVERAGE } from "../../workers/_shared/leagues-coverage.js";
import { getFixtureProviderPlan } from "../adapters/registry.js";
import { summarizeFixtureProviderCapability } from "../adapters/fixture-provider-capabilities.js";

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    start: null,
    days: 3,
    output: "data/football-truth/_diagnostics/fixture-acquisition-stability/fixture-acquisition-stability-workset.json"
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();

    if ((arg === "--start" || arg === "--date") && argv[i + 1]) {
      out.start = String(argv[++i] || "").trim();
      continue;
    }

    if (arg === "--days" && argv[i + 1]) {
      out.days = Number.parseInt(String(argv[++i] || "").trim(), 10);
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      out.output = String(argv[++i] || "").trim();
      continue;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
      out.start = arg;
      continue;
    }
  }

  if (!out.start || !/^\d{4}-\d{2}-\d{2}$/.test(out.start)) {
    throw new Error("missing or invalid --start YYYY-MM-DD");
  }

  if (!Number.isFinite(out.days) || out.days < 1 || out.days > 14) {
    throw new Error(`invalid --days: ${out.days}`);
  }

  return out;
}

function addDays(dayKey, offset) {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function readJsonIfExists(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return {
      __readError: error?.message || String(error)
    };
  }
}

function normalizeCoverageRows(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.leagues)) return value.leagues;
  if (Array.isArray(value?.rows)) return value.rows;

  if (value && typeof value === "object") {
    return Object.entries(value).map(([slug, row]) => ({
      slug,
      ...(row && typeof row === "object" ? row : {})
    }));
  }

  return [];
}

function getSlug(row) {
  return String(row?.slug || row?.leagueSlug || row?.id || "").trim();
}

function getLeagueName(row) {
  return String(row?.name || row?.label || row?.leagueName || "").trim();
}

function collectFixtureRows(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;

  for (const key of ["fixtures", "events", "matches", "rows", "data"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }

  if (payload && typeof payload === "object") {
    const values = Object.values(payload).filter((value) => value && typeof value === "object");
    const arrays = values.filter(Array.isArray);
    if (arrays.length === 1) return arrays[0];
  }

  return [];
}

function collectSourceTokens(value, out = []) {
  if (value == null) return out;

  if (typeof value === "string" || typeof value === "number") {
    const token = String(value).trim();
    if (token) out.push(token);
    return out;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectSourceTokens(item, out);
    return out;
  }

  if (typeof value === "object") {
    for (const key of [
      "source",
      "sourceId",
      "sourceName",
      "sourceProvider",
      "provider",
      "providerId",
      "origin",
      "originProvider",
      "fixtureProvider",
      "canonicalSource",
      "sources"
    ]) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        collectSourceTokens(value[key], out);
      }
    }
  }

  return out;
}

function uniqueSorted(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].sort();
}

function sourceClass(sourceIds) {
  const lower = sourceIds.map((source) => source.toLowerCase());

  if (lower.length === 0) return "unknown_source";
  if (lower.some((source) => source.includes("espn"))) {
    if (lower.some((source) => !source.includes("espn"))) return "mixed_supplemental_and_non_supplemental";
    return "supplemental_scoreboard_only";
  }

  return "non_supplemental_source_present";
}

function readCanonicalLeagueDay(dayKey, leagueSlug) {
  const file = path.join("data", "canonical-fixtures", dayKey, `${leagueSlug}.json`);
  const payload = readJsonIfExists(file);
  const rows = collectFixtureRows(payload);

  const sourceIds = uniqueSorted(rows.flatMap((row) => collectSourceTokens(row)));

  return {
    file,
    exists: fs.existsSync(file),
    readError: payload?.__readError || null,
    fixtureCount: rows.length,
    sourceIds,
    sourceClass: sourceClass(sourceIds)
  };
}

function readHistoryCounts() {
  const file = "data/history/2025-2026.json";
  const payload = readJsonIfExists(file);
  const counts = new Map();

  if (!payload || payload.__readError) {
    return {
      file,
      ok: false,
      error: payload?.__readError || "missing_history_file",
      counts
    };
  }

  const days = Array.isArray(payload?.days) ? payload.days : [];
  for (const day of days) {
    const rows = Array.isArray(day?.rows) ? day.rows : [];
    for (const row of rows) {
      const slug = getSlug(row);
      if (!slug) continue;
      counts.set(slug, (counts.get(slug) || 0) + 1);
    }
  }

  return {
    file,
    ok: true,
    error: null,
    counts
  };
}

function priorityForRow(row) {
  if (row.activeFixtureCount > 0 && row.hasVerifiedFixtureProviderCapability !== true) return "p0";
  if (row.activeFixtureCount > 0 && row.hasOnlySupplementalScoreboardSource === true) return "p0";
  if (row.activeFixtureCount > 0 && row.historyRows < 20) return "p1";
  if (row.activeFixtureCount === 0 && row.isTopDeclaredCoverage === true && row.hasVerifiedFixtureProviderCapability !== true) return "p2";
  return "p3";
}

function reasonForRow(row) {
  const reasons = [];

  if (row.activeFixtureCount > 0) reasons.push("active_in_audit_window");
  if (row.hasVerifiedFixtureProviderCapability !== true) reasons.push("missing_verified_fixture_provider_capability");
  if (row.hasOnlySupplementalScoreboardSource === true) reasons.push("supplemental_scoreboard_only_source_seen");
  if (row.historyRows === 0) reasons.push("missing_history_rows");
  else if (row.historyRows < 20) reasons.push("thin_history_rows");
  if (row.activeFixtureCount === 0) reasons.push("no_canonical_fixtures_seen_in_window");

  return reasons;
}

function main() {
  const args = parseArgs();
  const dayKeys = Array.from({ length: args.days }, (_, index) => addDays(args.start, index));
  const coverageRows = normalizeCoverageRows(LEAGUES_COVERAGE);
  const history = readHistoryCounts();

  const rows = [];

  for (const coverageRow of coverageRows) {
    const leagueSlug = getSlug(coverageRow);
    if (!leagueSlug) continue;

    const plan = getFixtureProviderPlan(leagueSlug);
    const configuredProviders = Array.isArray(plan?.providers)
      ? plan.providers
      : Array.isArray(plan?.supported)
        ? plan.supported
        : [];

    const capability = summarizeFixtureProviderCapability(leagueSlug, configuredProviders);

    const days = dayKeys.map((dayKey) => ({
      dayKey,
      ...readCanonicalLeagueDay(dayKey, leagueSlug)
    }));

    const sourceIds = uniqueSorted(days.flatMap((day) => day.sourceIds || []));
    const daySourceClasses = uniqueSorted(days.map((day) => day.sourceClass));
    const activeFixtureCount = days.reduce((sum, day) => sum + Number(day.fixtureCount || 0), 0);
    const activeDays = days.filter((day) => Number(day.fixtureCount || 0) > 0).map((day) => day.dayKey);

    const hasOnlySupplementalScoreboardSource =
      daySourceClasses.includes("supplemental_scoreboard_only") &&
      !daySourceClasses.includes("non_supplemental_source_present") &&
      !daySourceClasses.includes("mixed_supplemental_and_non_supplemental");

    const hasVerifiedFixtureProviderCapability =
      capability.hasVerifiedFixtureProviderCapability === true ||
      capability.hasValueReadyVerifiedProvider === true ||
      capability.hasValueReadyNonEspnProvider === true;

    const row = {
      leagueSlug,
      name: getLeagueName(coverageRow),
      country: coverageRow.country || coverageRow.countryCode || null,
      tier: coverageRow.tier ?? null,
      declaredCoverageRow: true,
      isTopDeclaredCoverage: Number(coverageRow.tier || 99) <= 2,
      activeFixtureCount,
      activeDays,
      daySourceClasses,
      sourceIds,
      historyRows: history.counts.get(leagueSlug) || 0,
      providerPlanIds: Array.isArray(plan?.supported) ? plan.supported.map((provider) => provider.id).filter(Boolean) : [],
      verifiedFixtureProviderIds:
        capability.valueReadyVerifiedProviderIds ||
        capability.valueReadyNonEspnProviderIds ||
        [],
      supplementalProviderIds: capability.supplementalProviderIds || [],
      hasVerifiedFixtureProviderCapability,
      hasOnlySupplementalScoreboardSource,
      days,
      guarantees: {
        sourceFetch: false,
        canonicalWrites: 0,
        valueWrites: false,
        detailsWrites: false,
        productionWrite: false
      }
    };

    row.priority = priorityForRow(row);
    row.reasons = reasonForRow(row);

    rows.push(row);
  }

  rows.sort((a, b) => {
    const priorityOrder = { p0: 0, p1: 1, p2: 2, p3: 3 };
    return (
      (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9) ||
      b.activeFixtureCount - a.activeFixtureCount ||
      a.leagueSlug.localeCompare(b.leagueSlug)
    );
  });

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    auditWindow: {
      start: args.start,
      days: args.days,
      dayKeys
    },
    sourceFetch: false,
    canonicalWrites: 0,
    valueWrites: false,
    detailsWrites: false,
    productionWrite: false,
    history: {
      file: history.file,
      ok: history.ok,
      error: history.error
    },
    summary: {
      declaredLeagueCount: rows.length,
      activeDeclaredLeaguesInWindow: rows.filter((row) => row.activeFixtureCount > 0).length,
      activeWithoutVerifiedProviderCapability: rows.filter((row) => row.activeFixtureCount > 0 && row.hasVerifiedFixtureProviderCapability !== true).length,
      activeSupplementalScoreboardOnly: rows.filter((row) => row.activeFixtureCount > 0 && row.hasOnlySupplementalScoreboardSource === true).length,
      activeWithThinHistory: rows.filter((row) => row.activeFixtureCount > 0 && row.historyRows < 20).length,
      p0: rows.filter((row) => row.priority === "p0").length,
      p1: rows.filter((row) => row.priority === "p1").length,
      p2: rows.filter((row) => row.priority === "p2").length,
      p3: rows.filter((row) => row.priority === "p3").length
    },
    p0: rows.filter((row) => row.priority === "p0"),
    p1: rows.filter((row) => row.priority === "p1"),
    rows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    auditWindow: report.auditWindow,
    summary: report.summary,
    guarantees: {
      sourceFetch: false,
      canonicalWrites: 0,
      valueWrites: false,
      detailsWrites: false,
      productionWrite: false
    }
  }, null, 2));
}

main();