#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { listOfficialRouteRegistrySlugs } from "./lib/football-truth-season-calendar-official-route-registry.js";

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function parseArgs(argv) {
  const out = {
    selfTest: false,
    inventory: "",
    output: ""
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") {
      out.selfTest = true;
      continue;
    }

    if (arg === "--inventory") {
      out.inventory = argv[i + 1] || "";
      i += 1;
      continue;
    }

    if (arg === "--output") {
      out.output = argv[i + 1] || "";
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return out;
}

function inventoryRowsFrom(input) {
  if (Array.isArray(input.inventoryRows)) return input.inventoryRows;
  if (Array.isArray(input.rows)) return input.rows;
  if (Array.isArray(input.leagueRows)) return input.leagueRows;
  return [];
}

function buildReport(inventory) {
  const rows = inventoryRowsFrom(inventory);
  const registrySlugs = listOfficialRouteRegistrySlugs();
  const registrySet = new Set(registrySlugs);

  const coverageRows = rows
    .map((row) => {
      const leagueSlug = asText(row.leagueSlug || row.competitionSlug || row.slug);
      if (!leagueSlug) return null;

      return {
        leagueSlug,
        competitionName: asText(row.competitionName || row.name),
        coverageType: asText(row.coverageType || row.competitionFamily || row.competitionType),
        coverageRegion: asText(row.coverageRegion || row.region),
        coverageCountry: asText(row.coverageCountry || row.country),
        hasOfficialRouteRegistry: registrySet.has(leagueSlug)
      };
    })
    .filter(Boolean);

  const withRegistry = coverageRows.filter((row) => row.hasOfficialRouteRegistry);
  const missingRegistry = coverageRows.filter((row) => !row.hasOfficialRouteRegistry);

  function grouped(rowsToGroup, key) {
    const counts = new Map();

    for (const row of rowsToGroup) {
      const value = asText(row[key]) || "unknown";
      counts.set(value, (counts.get(value) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  return {
    ok: true,
    job: "audit-football-truth-season-calendar-official-route-registry-file",
    summary: {
      totalCoverageRows: coverageRows.length,
      officialRouteRegistrySlugCount: registrySlugs.length,
      registryCoverageRate: coverageRows.length > 0 ? Number((withRegistry.length / coverageRows.length).toFixed(4)) : 0,
      missingOfficialRouteRegistryCount: missingRegistry.length,
      byCoverageTypeMissingRegistry: grouped(missingRegistry, "coverageType"),
      byRegionMissingRegistry: grouped(missingRegistry, "coverageRegion"),
      byCountryMissingRegistryTop80: grouped(missingRegistry, "coverageCountry").slice(0, 80),
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    registrySlugs,
    missingRegistryPrioritySample: missingRegistry.slice(0, 200),
    guarantees: {
      noSearch: true,
      noFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true
    }
  };
}

function selfTest() {
  const report = buildReport({
    inventoryRows: [
      { leagueSlug: "eng.1", competitionName: "Premier League", coverageType: "league", coverageRegion: "europe", coverageCountry: "england" },
      { leagueSlug: "test.missing", competitionName: "Missing League", coverageType: "league", coverageRegion: "test", coverageCountry: "testland" }
    ]
  });

  if (report.summary.totalCoverageRows !== 2) throw new Error("expected two coverage rows");
  if (report.summary.officialRouteRegistrySlugCount < 100) throw new Error("expected expanded registry coverage");
  if (report.summary.missingOfficialRouteRegistryCount !== 1) throw new Error("expected one missing registry row");

  return {
    ok: true,
    selfTest: true,
    summary: report.summary,
    guarantees: report.guarantees
  };
}

function main() {
  const args = parseArgs(process.argv);

  if (args.selfTest) {
    console.log(JSON.stringify(selfTest(), null, 2));
    return;
  }

  if (!args.inventory) throw new Error("Missing required --inventory <path>");
  if (!args.output) throw new Error("Missing required --output <path>");

  const inventory = readJson(args.inventory);
  const report = buildReport(inventory);

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main();
}

export {
  buildReport,
  selfTest
};