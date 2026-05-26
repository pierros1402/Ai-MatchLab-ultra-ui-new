#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv = process.argv) {
  const args = {
    input: "",
    output: "",
    date: "",
    selfTest: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--input" && argv[i + 1]) {
      args.input = String(argv[++i] || "").trim();
      continue;
    }

    if (arg.startsWith("--input=")) {
      args.input = arg.slice("--input=".length).trim();
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      args.output = String(argv[++i] || "").trim();
      continue;
    }

    if (arg.startsWith("--output=")) {
      args.output = arg.slice("--output=".length).trim();
      continue;
    }

    if ((arg === "--date" || arg === "--day") && argv[i + 1]) {
      args.date = String(argv[++i] || "").trim();
      continue;
    }

    if (arg.startsWith("--date=")) {
      args.date = arg.slice("--date=".length).trim();
      continue;
    }
  }

  return args;
}

function readJson(filePath) {
  if (!filePath) throw new Error("missing --input");
  if (!fs.existsSync(filePath)) throw new Error(`missing input file: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  if (!filePath) throw new Error("missing --output");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function asText(value) {
  return String(value || "").trim();
}

function leagueConfig(slug, name) {
  const base = {
    leagueSlug: slug,
    name,
    officialDomains: [],
    federationDomains: [],
    leagueSearchNames: [name],
    clubSearchFallbackTerms: []
  };

  const bySlug = {
    "gre.1": {
      officialDomains: ["slgr.gr"],
      federationDomains: ["epo.gr"],
      leagueSearchNames: ["Super League Greece", "Stoiximan Super League"],
      clubSearchFallbackTerms: ["Olympiacos", "Panathinaikos", "PAOK", "AEK Athens"]
    },
    "ltu.1": {
      officialDomains: ["alyga.lt"],
      federationDomains: ["lff.lt"],
      leagueSearchNames: ["Lithuanian A Lyga", "A Lyga Lithuania"],
      clubSearchFallbackTerms: ["Zalgiris", "Kauno Zalgiris", "Hegelmann", "Panevezys"]
    },
    "nor.1": {
      officialDomains: ["eliteserien.no"],
      federationDomains: ["fotball.no"],
      leagueSearchNames: ["Eliteserien", "Norwegian Eliteserien"],
      clubSearchFallbackTerms: ["Bodo Glimt", "Molde", "Rosenborg", "Brann"]
    },
    "por.1": {
      officialDomains: ["ligaportugal.pt"],
      federationDomains: ["fpf.pt"],
      leagueSearchNames: ["Primeira Liga", "Liga Portugal Betclic"],
      clubSearchFallbackTerms: ["Benfica", "Porto", "Sporting CP", "Braga"]
    },
    "rus.1": {
      officialDomains: ["premierliga.ru"],
      federationDomains: ["rfs.ru"],
      leagueSearchNames: ["Russian Premier League", "Mir Russian Premier League"],
      clubSearchFallbackTerms: ["Zenit", "Spartak Moscow", "CSKA Moscow", "Lokomotiv Moscow"]
    },
    "sco.1": {
      officialDomains: ["spfl.co.uk"],
      federationDomains: ["scottishfa.co.uk"],
      leagueSearchNames: ["Scottish Premiership", "SPFL Premiership"],
      clubSearchFallbackTerms: ["Celtic", "Rangers", "Hearts", "Hibernian"]
    },
    "tur.1": {
      officialDomains: ["tff.org"],
      federationDomains: ["tff.org"],
      leagueSearchNames: ["Süper Lig", "Turkish Super Lig"],
      clubSearchFallbackTerms: ["Galatasaray", "Fenerbahce", "Besiktas", "Trabzonspor"]
    },
    "ukr.1": {
      officialDomains: ["upl.ua"],
      federationDomains: ["uaf.ua"],
      leagueSearchNames: ["Ukrainian Premier League", "UPL Ukraine"],
      clubSearchFallbackTerms: ["Shakhtar Donetsk", "Dynamo Kyiv", "Dnipro-1", "Polissya"]
    },
    "ned.1": {
      officialDomains: ["eredivisie.nl"],
      federationDomains: ["knvb.nl"],
      leagueSearchNames: ["Eredivisie"],
      clubSearchFallbackTerms: ["Ajax", "PSV", "Feyenoord", "Utrecht"]
    },
    "pol.1": {
      officialDomains: ["ekstraklasa.org"],
      federationDomains: ["pzpn.pl"],
      leagueSearchNames: ["Ekstraklasa"],
      clubSearchFallbackTerms: ["Legia Warszawa", "Lech Poznan", "Rakow", "Jagiellonia"]
    },
    "sui.1": {
      officialDomains: ["sfl.ch"],
      federationDomains: ["football.ch"],
      leagueSearchNames: ["Swiss Super League"],
      clubSearchFallbackTerms: ["Basel", "Young Boys", "Servette", "Lugano"]
    }
  };

  return {
    ...base,
    ...(bySlug[slug] || {})
  };
}

function unique(values) {
  return [...new Set(values.map((value) => asText(value)).filter(Boolean))];
}

function buildQueries(config, targetDate) {
  const leagueNames = unique(config.leagueSearchNames.length > 0 ? config.leagueSearchNames : [config.name]);
  const officialDomains = unique(config.officialDomains);
  const federationDomains = unique(config.federationDomains);
  const clubs = unique(config.clubSearchFallbackTerms);

  const queries = [];

  for (const leagueName of leagueNames) {
    for (const domain of officialDomains) {
      queries.push({
        kind: "official_league_calendar",
        priority: 100,
        query: `site:${domain} ${leagueName} fixtures ${targetDate}`,
        requiredSignals: ["target_date_visible", "match_level_rows", "league_context"],
        rejectSignals: ["homepage_only", "news_only", "video_only", "standings_only", "wrong_date", "wrong_competition"]
      });

      queries.push({
        kind: "official_league_schedule",
        priority: 95,
        query: `site:${domain} ${leagueName} schedule ${targetDate}`,
        requiredSignals: ["target_date_visible", "match_level_rows", "league_context"],
        rejectSignals: ["homepage_only", "news_only", "video_only", "standings_only", "wrong_date", "wrong_competition"]
      });
    }

    for (const domain of federationDomains) {
      queries.push({
        kind: "official_federation_calendar",
        priority: 90,
        query: `site:${domain} ${leagueName} fixtures ${targetDate}`,
        requiredSignals: ["target_date_visible", "match_level_rows", "league_context"],
        rejectSignals: ["homepage_only", "news_only", "video_only", "standings_only", "wrong_date", "wrong_competition"]
      });
    }

    queries.push({
      kind: "independent_structured_fixture_page",
      priority: 70,
      query: `"${leagueName}" fixtures "${targetDate}" official schedule`,
      requiredSignals: ["target_date_visible", "match_level_rows", "league_context"],
      rejectSignals: ["betexplorer", "flashscore", "homepage_only", "news_only", "video_only", "wrong_date", "wrong_competition"]
    });
  }

  for (const club of clubs.slice(0, 4)) {
    queries.push({
      kind: "club_calendar_fallback",
      priority: 55,
      query: `${club} fixtures ${targetDate} official`,
      requiredSignals: ["target_date_visible", "club_match_fixture", "league_context"],
      rejectSignals: ["news_only", "video_only", "homepage_only", "wrong_date", "wrong_competition"]
    });
  }

  return queries
    .map((item, index) => ({
      discoveryTargetId: `${config.leagueSlug}:discovery:${String(index + 1).padStart(2, "0")}`,
      ...item
    }))
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.discoveryTargetId.localeCompare(b.discoveryTargetId);
    });
}

function normalizeRows(input) {
  if (Array.isArray(input.rows)) return input.rows;
  if (input.rows && Array.isArray(input.rows.rows)) return input.rows.rows;
  return [];
}

function shouldBuildTargets(row) {
  const usableRows = Number(row.classifierUsableRows || row.usableRows || 0);
  if (usableRows > 0) return false;

  return true;
}

function buildTargets(input, options = {}) {
  const targetDate = options.date || input.targetDate || input.summary?.targetDate || input.targetDate || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new Error("--date YYYY-MM-DD is required");
  }

  const rows = normalizeRows(input)
    .filter((row) => asText(row.leagueSlug))
    .filter(shouldBuildTargets);

  const discoveryCases = rows.map((row) => {
    const leagueSlug = asText(row.leagueSlug);
    const name = asText(row.name);
    const config = leagueConfig(leagueSlug, name);
    const discoveryTargets = buildQueries(config, targetDate);

    return {
      caseId: `${leagueSlug}:${targetDate}:source-discovery`,
      leagueSlug,
      name,
      targetDate,
      priorClassification: {
        inspectorLikelyRows: Number(row.inspectorLikelyRows || 0),
        classifierUsableRows: Number(row.classifierUsableRows || 0),
        homepageNoiseRows: Number(row.homepageNoiseRows || 0),
        insufficientRows: Number(row.insufficientRows || 0),
        needsDateSpecificSource: Boolean(row.needsDateSpecificSource),
        reason: asText(row.conclusion || row.reason)
      },
      sourcePolicy: {
        allowOfficialLeague: true,
        allowFederation: true,
        allowClubFallback: true,
        allowIndependentStructuredSecondSource: true,
        rejectHomepageOnly: true,
        rejectNewsOnly: true,
        rejectVideoOnly: true,
        rejectStandingsOnly: true,
        rejectWrongCompetition: true,
        rejectWrongDate: true,
        excludedHosts: [
          "betexplorer.com",
          "www.betexplorer.com",
          "flashscore.com",
          "www.flashscore.com",
          "flashscore.co.za",
          "soccerway.com",
          "www.soccerway.com",
          "aiscore.com",
          "www.aiscore.com",
          "sofascore.com",
          "www.sofascore.com"
        ]
      },
      acceptanceCriteria: [
        "Page must show the target date or a filterable schedule that can be resolved to the target date.",
        "Page must provide match-level fixture rows or explicit no-fixture evidence for the target date.",
        "League/competition context must match the requested league.",
        "Homepage, news, videos, standings, and unrelated competition pages are not usable evidence.",
        "A verified fixture decision still requires official/primary evidence plus independent agreement."
      ],
      discoveryTargets,
      reviewerFields: {
        selectedOfficialUrl: "",
        selectedIndependentUrl: "",
        selectedClubFallbackUrl: "",
        evidenceNotes: "",
        reviewerDecision: "pending_discovery"
      },
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    };
  });

  const totalDiscoveryTargetCount = discoveryCases.reduce((sum, item) => sum + item.discoveryTargets.length, 0);

  return {
    ok: true,
    job: "build-fixture-league-date-source-discovery-targets-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_fixture_league_date_source_discovery_targets",
    targetDate,
    sourceInput: options.input || "",
    summary: {
      inputRowCount: normalizeRows(input).length,
      discoveryCaseCount: discoveryCases.length,
      totalDiscoveryTargetCount,
      casesWithUsableRowsSkipped: normalizeRows(input).filter((row) => Number(row.classifierUsableRows || row.usableRows || 0) > 0).length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    discoveryCases,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function selfTest() {
  const input = {
    rows: [
      {
        leagueSlug: "gre.1",
        name: "Super League Greece",
        inspectorLikelyRows: 2,
        classifierUsableRows: 0,
        homepageNoiseRows: 5,
        insufficientRows: 100,
        needsDateSpecificSource: true,
        conclusion: "needs_date_specific_source"
      },
      {
        leagueSlug: "srb.1",
        name: "Serbian SuperLiga",
        inspectorLikelyRows: 2,
        classifierUsableRows: 2,
        homepageNoiseRows: 0,
        insufficientRows: 0,
        needsDateSpecificSource: false,
        conclusion: "has_usable_fixture_row_candidates_needing_manual_review"
      }
    ]
  };

  const report = buildTargets(input, {
    date: "2026-05-22",
    input: "self-test"
  });

  if (report.summary.inputRowCount !== 2) {
    throw new Error(`self-test failed: expected 2 input rows, got ${report.summary.inputRowCount}`);
  }

  if (report.summary.discoveryCaseCount !== 1) {
    throw new Error(`self-test failed: expected 1 discovery case, got ${report.summary.discoveryCaseCount}`);
  }

  const gre = report.discoveryCases.find((item) => item.leagueSlug === "gre.1");
  if (!gre) throw new Error("self-test failed: missing gre.1 discovery case");

  if (!gre.discoveryTargets.some((item) => item.query.includes("site:slgr.gr"))) {
    throw new Error("self-test failed: missing official league domain query for gre.1");
  }

  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false || report.guarantees.noFetch !== true) {
    throw new Error("self-test failed: safety guarantees missing");
  }

  return report;
}

async function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-fixture-league-date-source-discovery-targets-file",
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error("--date YYYY-MM-DD is required");
  }

  const input = readJson(args.input);
  const report = buildTargets(input, {
    input: args.input,
    date: args.date
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    job: "build-fixture-league-date-source-discovery-targets-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
});
