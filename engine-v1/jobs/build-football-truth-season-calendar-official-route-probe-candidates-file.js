#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  getDefaultRouteTemplates,
  getOfficialRouteEntry
} from "./lib/football-truth-season-calendar-official-route-registry.js";

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

function canonicalHost(host) {
  return asText(host).toLowerCase().replace(/^www\./, "");
}

function urlFor(host, route) {
  const cleanHost = canonicalHost(host);
  const cleanRoute = route.startsWith("/") ? route : `/${route}`;
  return `https://www.${cleanHost}${cleanRoute}`;
}

function parseArgs(argv) {
  const out = {
    selfTest: false,
    strictRank: "",
    strictValidation: "",
    selectedTargets: "",
    output: ""
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") {
      out.selfTest = true;
      continue;
    }

    if (arg === "--strict-rank") {
      out.strictRank = argv[i + 1] || "";
      i += 1;
      continue;
    }

    if (arg === "--strict-validation") {
      out.strictValidation = argv[i + 1] || "";
      i += 1;
      continue;
    }

    if (arg === "--selected-targets") {
      out.selectedTargets = argv[i + 1] || "";
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

function officialRouteProbeConfigForLeague(leagueSlug) {
  const entry = getOfficialRouteEntry(leagueSlug);

  if (!entry) {
    return {
      hosts: [],
      routes: []
    };
  }

  const hosts = Array.isArray(entry.hosts) ? entry.hosts : [];
  const specificRoutes = Array.isArray(entry.routes) ? entry.routes : [];
  const defaultRoutes = getDefaultRouteTemplates();

  return {
    hosts,
    routes: Array.from(new Set([...specificRoutes, ...defaultRoutes]))
  };
}
function selectedTargetLeagueSlugs(selectedTargetsInput) {
  if (!selectedTargetsInput) return [];

  const rows = Array.isArray(selectedTargetsInput.selectedSearchTargetRows)
    ? selectedTargetsInput.selectedSearchTargetRows
    : Array.isArray(selectedTargetsInput.searchTargetRows)
      ? selectedTargetsInput.searchTargetRows
      : Array.isArray(selectedTargetsInput.rows)
        ? selectedTargetsInput.rows
        : [];

  return Array.from(new Set(
    rows
      .map((row) => asText(row.leagueSlug || row.competitionSlug || row.slug))
      .filter(Boolean)
  ));
}
function highConfidenceAcceptedLeagueSet(validationRows) {
  return new Set(
    validationRows
      .filter((row) =>
        row.validationState === "season_calendar_validated_from_official_source" &&
        row.validationConfidence === "high" &&
        row.requiresSecondSource === false
      )
      .map((row) => asText(row.leagueSlug))
      .filter(Boolean)
  );
}

function buildReport(input, options = {}) {
  const strictCandidates = Array.isArray(input.rankedCandidateUrlRows)
    ? input.rankedCandidateUrlRows
    : [];

  const validationRows = Array.isArray(input.validatedSeasonStatusEvidenceRows)
    ? input.validatedSeasonStatusEvidenceRows
    : Array.isArray(input.seasonStatusValidationRows)
      ? input.seasonStatusValidationRows
      : [];

  const accepted = highConfidenceAcceptedLeagueSet(validationRows);
  const selectedTargetsInput = input.selectedTargetsInput || null;
  const selectedRegistryCandidates = selectedTargetLeagueSlugs(selectedTargetsInput)
    .filter((leagueSlug) => !accepted.has(leagueSlug) && getOfficialRouteEntry(leagueSlug));

  const needsMore = validationRows
    .filter((row) => !accepted.has(asText(row.leagueSlug)))
    .map((row) => asText(row.leagueSlug))
    .filter(Boolean);

  const candidateLeagueSlugs = Array.from(new Set([
    ...selectedRegistryCandidates,
    ...needsMore,
    ...strictCandidates.map((row) => asText(row.leagueSlug)).filter((slug) => slug && !accepted.has(slug))
  ]));

  const metaByLeague = new Map();

  for (const row of strictCandidates) {
    const leagueSlug = asText(row.leagueSlug);
    if (leagueSlug && !metaByLeague.has(leagueSlug)) metaByLeague.set(leagueSlug, row);
  }

  const out = [];
  const seen = new Set();

  for (const leagueSlug of candidateLeagueSlugs) {
    const probeConfig = officialRouteProbeConfigForLeague(leagueSlug);
    const hosts = probeConfig.hosts;
    const routes = probeConfig.routes;
    const meta = metaByLeague.get(leagueSlug) || validationRows.find((row) => asText(row.leagueSlug) === leagueSlug) || {};

    for (const host of hosts) {
      for (const route of routes) {
        const candidateUrl = urlFor(host, route);
        const key = `${leagueSlug}|${candidateUrl}`.toLowerCase();

        if (seen.has(key)) continue;
        seen.add(key);

        out.push({
          leagueSlug,
          competitionSlug: leagueSlug,
          competitionName: asText(meta.competitionName || meta.name),
          name: asText(meta.competitionName || meta.name),
          candidateUrl,
          finalUrl: candidateUrl,
          resolvedUrl: candidateUrl,
          hostname: canonicalHost(host),
          title: `${leagueSlug} official route probe ${route}`,
          snippet: `${asText(meta.competitionName || meta.name)} official fixtures results calendar schedule standings`,
          targetType: "official-route-probe",
          query: "",
          rank: 1,
          urlClass: "official_route_probe_candidate",
          compositeScore: 250,
          scoreReasons: [
            "official_host_registry",
            "route_probe",
            "calendar_surface_path"
          ],
          sourceClass: "official_governing_or_competition_operator",
          truthRole: "season_calendar_official_route_probe_candidate",
          readyForFetch: true,
          fetchPurpose: "season_activity_status_calendar",
          validationIntent: "season_status_calendar_official_route_probe_validation",
          manualCandidateUrlUsed: false,
          inventedUrls: false,
          sourceFetch: false,
          fetchState: "not_fetched",
          canonicalWrites: 0,
          productionWrite: false,
          dryRun: true
        });
      }
    }
  }

  const limit = Number(options.limit || 180);
  const limited = out.slice(0, limit);

  const byLeague = {};

  for (const row of limited) {
    if (!byLeague[row.leagueSlug]) {
      byLeague[row.leagueSlug] = {
        name: row.competitionName,
        candidateUrlCount: 0,
        hostnames: []
      };
    }

    byLeague[row.leagueSlug].candidateUrlCount += 1;

    if (!byLeague[row.leagueSlug].hostnames.includes(row.hostname)) {
      byLeague[row.leagueSlug].hostnames.push(row.hostname);
    }
  }

  return {
    ok: true,
    job: "build-football-truth-season-calendar-official-route-probe-candidates-file",
    mode: "read_only_route_probe_candidate_derivation",
    input: {
      strictRankPath: options.strictRankPath || "",
      strictValidationPath: options.strictValidationPath || "",
      selectedTargetsPath: options.selectedTargetsPath || ""
    },
    summary: {
      strictCandidateCount: strictCandidates.length,
      validationRowCount: validationRows.length,
      acceptedLeagueCount: accepted.size,
      registryFirstSelectedLeagueCount: selectedRegistryCandidates.length,
      probeLeagueCount: Object.keys(byLeague).length,
      probeCandidateCount: limited.length,
      byLeague,
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    guarantees: {
      noSearch: true,
      noFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true
    },
    rankedCandidateUrlRows: limited,
    acceptedCandidateUrlRows: limited
  };
}

function selfTest() {
  const input = {
    rankedCandidateUrlRows: [
      {
        leagueSlug: "bel.1",
        competitionName: "Belgian Pro League"
      },
      {
        leagueSlug: "uefa.champions",
        competitionName: "UEFA Champions League"
      },
      {
        leagueSlug: "eng.1",
        competitionName: "Premier League"
      }
    ],
    validatedSeasonStatusEvidenceRows: [
      {
        leagueSlug: "eng.1",
        competitionName: "Premier League",
        validationState: "season_calendar_validated_from_official_source",
        validationConfidence: "high",
        requiresSecondSource: false
      },
      {
        leagueSlug: "bel.1",
        competitionName: "Belgian Pro League",
        validationState: "season_calendar_candidate_needs_official_confirmation",
        validationConfidence: "medium",
        requiresSecondSource: true
      },
      {
        leagueSlug: "uefa.champions",
        competitionName: "UEFA Champions League",
        validationState: "season_calendar_candidate_needs_more_specific_evidence",
        validationConfidence: "medium",
        requiresSecondSource: true
      }
    ]
  };

  const report = buildReport(input, { limit: 100 });

  if (report.summary.acceptedLeagueCount !== 1) throw new Error("expected one accepted league");
  if (report.summary.probeLeagueCount !== 2) throw new Error("expected two probe leagues");

  const belRows = report.rankedCandidateUrlRows.filter((row) => row.leagueSlug === "bel.1");
  const uefaRows = report.rankedCandidateUrlRows.filter((row) => row.leagueSlug === "uefa.champions");
  const engRows = report.rankedCandidateUrlRows.filter((row) => row.leagueSlug === "eng.1");

  if (belRows.length < 1) throw new Error("expected Belgian route probe rows");
  if (uefaRows.length < 1) throw new Error("expected UEFA Champions route probe rows");
  if (engRows.length !== 0) throw new Error("accepted league should not be route probed");

  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("read-only guarantees failed");
  }

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

  if (!args.strictRank) throw new Error("Missing required --strict-rank <path>");
  if (!args.strictValidation) throw new Error("Missing required --strict-validation <path>");
  if (!args.output) throw new Error("Missing required --output <path>");

  const strictRank = readJson(args.strictRank);
  const strictValidation = readJson(args.strictValidation);
  const selectedTargets = args.selectedTargets ? readJson(args.selectedTargets) : null;

  const report = buildReport(
    {
      rankedCandidateUrlRows: strictRank.rankedCandidateUrlRows || [],
      validatedSeasonStatusEvidenceRows: strictValidation.validatedSeasonStatusEvidenceRows || strictValidation.seasonStatusValidationRows || [],
      selectedTargetsInput: selectedTargets
    },
    {
      strictRankPath: args.strictRank,
      strictValidationPath: args.strictValidation,
      selectedTargetsPath: args.selectedTargets || "",
      limit: 1800
    }
  );

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