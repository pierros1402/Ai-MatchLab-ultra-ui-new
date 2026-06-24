#!/usr/bin/env node
"use strict";

import fs from "node:fs";
import path from "node:path";

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    board: "",
    validation: "",
    audit: "",
    output: "",
    registryGaps: [],
    selfTest: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--self-test") {
      args.selfTest = true;
    } else if (arg === "--board" && argv[index + 1]) {
      args.board = argv[++index];
    } else if (arg.startsWith("--board=")) {
      args.board = arg.slice("--board=".length);
    } else if (arg === "--validation" && argv[index + 1]) {
      args.validation = argv[++index];
    } else if (arg.startsWith("--validation=")) {
      args.validation = arg.slice("--validation=".length);
    } else if (arg === "--audit" && argv[index + 1]) {
      args.audit = argv[++index];
    } else if (arg.startsWith("--audit=")) {
      args.audit = arg.slice("--audit=".length);
    } else if (arg === "--output" && argv[index + 1]) {
      args.output = argv[++index];
    } else if (arg.startsWith("--output=")) {
      args.output = arg.slice("--output=".length);
    } else if (arg === "--registry-gaps" && argv[index + 1]) {
      args.registryGaps = parseList(argv[++index]);
    } else if (arg.startsWith("--registry-gaps=")) {
      args.registryGaps = parseList(arg.slice("--registry-gaps=".length));
    }
  }

  return args;
}

function parseList(value) {
  return asText(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function rowsOf(input) {
  if (Array.isArray(input)) return input;

  for (const key of ["rows", "actionRows", "boardRows", "coverageRows", "items", "actionableRows"]) {
    if (Array.isArray(input?.[key])) return input[key];
  }

  return [];
}

function slugOf(row) {
  for (const key of ["competitionSlug", "leagueSlug", "slug", "competitionKey", "key"]) {
    const value = asText(row?.[key]);
    if (value) return value;
  }

  return "";
}

function groupBySlug(rows) {
  const map = new Map();

  for (const row of rows) {
    const slug = asText(row.leagueSlug || row.competitionSlug || row.slug);
    if (!slug) continue;
    if (!map.has(slug)) map.set(slug, []);
    map.get(slug).push(row);
  }

  return map;
}

function uniqueSorted(values) {
  return Array.from(new Set(values.map(asText).filter(Boolean))).sort();
}

function countBy(rows, key) {
  const out = {};

  for (const row of rows) {
    const value = asText(typeof key === "function" ? key(row) : row[key]) || "unknown";
    out[value] = (out[value] || 0) + 1;
  }

  return out;
}

function buildOverlay(inputs, options = {}) {
  const boardRows = rowsOf(inputs.board);
  const validRows = asArray(inputs.validation?.validSearchResultRows || inputs.validation?.searchResultRows);
  const repairRows = asArray(inputs.audit?.repairRouteRows);
  const registryGapSlugs = uniqueSorted(options.registryGaps || []);

  const validatedSlugs = uniqueSorted(validRows.map((row) => row.leagueSlug || row.competitionSlug));
  const repairSlugs = uniqueSorted(repairRows.map((row) => row.leagueSlug || row.competitionSlug));

  const validBySlug = groupBySlug(validRows);
  const repairBySlug = groupBySlug(repairRows);

  const overlayRows = [];

  for (const row of boardRows) {
    const slug = slugOf(row);
    const copy = { ...row };
    let overlayState = "unchanged";
    let nextAction = copy.nextAction;

    if (validatedSlugs.includes(slug)) {
      const evidence = asArray(validBySlug.get(slug));
      overlayState = "tier1_official_route_evidence_validated";
      nextAction = "adapt_validated_official_route_to_readiness_state";
      copy.tier1OfficialRouteValidation = {
        validationState: "validated_official_route_evidence",
        validRowCount: evidence.length,
        source: asText(options.validationSource),
        urls: evidence.slice(0, 8).map((item) => asText(item.url || item.candidateUrl || item.finalUrl)).filter(Boolean),
        noWebSearch: true,
        sourceFetch: false,
        canonicalWrites: 0,
        productionWrite: false
      };
    } else if (repairSlugs.includes(slug)) {
      const evidence = asArray(repairBySlug.get(slug));
      overlayState = "tier1_official_route_needs_repair";
      nextAction = "repair_official_route_registry_or_probe_url";
      copy.tier1OfficialRouteValidation = {
        validationState: "official_route_probe_failed_or_redirect_only",
        repairRowCount: evidence.length,
        source: asText(options.auditSource),
        routeStates: uniqueSorted(evidence.map((item) => item.routeState)),
        hostnames: uniqueSorted(evidence.map((item) => item.hostnames)),
        canonicalWrites: 0,
        productionWrite: false
      };
    } else if (registryGapSlugs.includes(slug)) {
      overlayState = "tier1_registry_gap";
      nextAction = "add_official_route_registry_entry";
      copy.tier1OfficialRouteValidation = {
        validationState: "missing_official_route_registry_entry",
        registryGap: true,
        canonicalWrites: 0,
        productionWrite: false
      };
    }

    copy.tier1OverlayState = overlayState;
    copy.nextAction = nextAction;
    overlayRows.push(copy);
  }

  const validatedOfficialRouteSlugs = uniqueSorted(
    overlayRows
      .filter((row) => row.tier1OverlayState === "tier1_official_route_evidence_validated")
      .map(slugOf)
  );
  const routeRepairSlugs = uniqueSorted(
    overlayRows
      .filter((row) => row.tier1OverlayState === "tier1_official_route_needs_repair")
      .map(slugOf)
  );
  const registryGapBoardSlugs = uniqueSorted(
    overlayRows
      .filter((row) => row.tier1OverlayState === "tier1_registry_gap")
      .map(slugOf)
  );

  return {
    ok: true,
    job: "apply-uefa-tier1-official-route-validation-overlay-file",
    mode: "read_only_uefa_tier1_validated_official_route_overlay",
    generatedAt: new Date().toISOString(),
    inputFiles: {
      board: asText(options.boardSource),
      validationResults: asText(options.validationSource),
      correctedAudit: asText(options.auditSource)
    },
    summary: {
      boardRowCount: overlayRows.length,
      validatedOfficialRouteSlugCount: validatedOfficialRouteSlugs.length,
      validatedOfficialRouteRowCount: validRows.length,
      routeRepairSlugCount: routeRepairSlugs.length,
      registryGapSlugCount: registryGapBoardSlugs.length,
      unchangedRowCount: overlayRows.filter((row) => row.tier1OverlayState === "unchanged").length,
      canonicalWrites: 0,
      productionWrite: false,
      sourceFetch: false,
      noGenericSearch: true
    },
    byOverlayState: Object.entries(countBy(overlayRows, "tier1OverlayState"))
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    validatedOfficialRouteSlugs,
    routeRepairSlugs,
    registryGapSlugs: registryGapBoardSlugs,
    rows: overlayRows,
    guarantees: {
      noSearch: true,
      noGenericSearch: true,
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true
    }
  };
}

function runSelfTest() {
  const board = {
    rows: [
      { competitionSlug: "aut.1", competitionName: "Austrian Bundesliga", nextAction: "old" },
      { competitionSlug: "bel.1", competitionName: "Belgian Pro League", nextAction: "old" },
      { competitionSlug: "cyp.1", competitionName: "Cyprus League", nextAction: "old" },
      { competitionSlug: "eng.1", competitionName: "Premier League", nextAction: "old" }
    ]
  };

  const validation = {
    validSearchResultRows: [
      { leagueSlug: "aut.1", url: "https://www.bundesliga.at/de/bundesliga/spielplan" },
      { leagueSlug: "aut.1", url: "https://www.bundesliga.at/de/bundesliga/tabelle" }
    ]
  };

  const audit = {
    repairRouteRows: [
      { leagueSlug: "bel.1", routeState: "no_usable_official_route_snapshot", hostnames: "www.proleague.be" }
    ]
  };

  const report = buildOverlay({ board, validation, audit }, {
    registryGaps: ["cyp.1"],
    boardSource: "board.json",
    validationSource: "validation.json",
    auditSource: "audit.json"
  });

  if (report.summary.boardRowCount !== 4) throw new Error("expected 4 board rows");
  if (report.summary.validatedOfficialRouteSlugCount !== 1) throw new Error("expected 1 validated slug");
  if (report.summary.validatedOfficialRouteRowCount !== 2) throw new Error("expected 2 validated rows");
  if (report.summary.routeRepairSlugCount !== 1) throw new Error("expected 1 repair slug");
  if (report.summary.registryGapSlugCount !== 1) throw new Error("expected 1 registry gap");
  if (report.summary.unchangedRowCount !== 1) throw new Error("expected 1 unchanged row");
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("job must be read-only");
  }

  console.log(JSON.stringify({
    ok: true,
    selfTest: "apply-uefa-tier1-official-route-validation-overlay-file",
    summary: report.summary
  }, null, 2));
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    runSelfTest();
    return;
  }

  if (!args.board) throw new Error("--board is required");
  if (!args.validation) throw new Error("--validation is required");
  if (!args.audit) throw new Error("--audit is required");
  if (!args.output) throw new Error("--output is required");

  const board = readJson(args.board);
  const validation = readJson(args.validation);
  const audit = readJson(args.audit);

  const report = buildOverlay({ board, validation, audit }, {
    registryGaps: args.registryGaps,
    boardSource: args.board,
    validationSource: args.validation,
    auditSource: args.audit
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    job: report.job,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
}

export {
  buildOverlay
};
