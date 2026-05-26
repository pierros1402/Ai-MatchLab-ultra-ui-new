#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv = process.argv) {
  const args = {
    inputDir: "",
    output: "",
    leagueSlug: "",
    leagueName: "",
    date: "",
    selfTest: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if ((arg === "--input-dir" || arg === "--dir") && argv[i + 1]) {
      args.inputDir = String(argv[++i] || "").trim();
      continue;
    }

    if (arg.startsWith("--input-dir=")) {
      args.inputDir = arg.slice("--input-dir=".length).trim();
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

    if (arg === "--league-slug" && argv[i + 1]) {
      args.leagueSlug = String(argv[++i] || "").trim();
      continue;
    }

    if (arg.startsWith("--league-slug=")) {
      args.leagueSlug = arg.slice("--league-slug=".length).trim();
      continue;
    }

    if (arg === "--league-name" && argv[i + 1]) {
      args.leagueName = String(argv[++i] || "").trim();
      continue;
    }

    if (arg.startsWith("--league-name=")) {
      args.leagueName = arg.slice("--league-name=".length).trim();
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

function escapeRx(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function leaguePatterns(leagueSlug, leagueName) {
  const slug = asText(leagueSlug).toLowerCase();
  const name = asText(leagueName);

  const common = [
    new RegExp(escapeRx(slug), "i")
  ];

  if (name) common.push(new RegExp(escapeRx(name), "i"));

  const bySlug = {
    "ned.1": [/eredivisie/i, /eredivisie\.nl/i, /knvb\.nl/i, /\bajax\b/i, /\bpsv\b/i, /feyenoord/i],
    "pol.1": [/ekstraklasa/i, /ekstraklasa\.org/i, /pzpn\.pl/i, /jagiellonia/i, /\blech\b/i, /\blegia\b/i, /rakow|raków/i],
    "sui.1": [/swiss super league/i, /sfl\.ch/i, /football\.ch/i, /swissfootballleague/i, /servette/i, /young boys/i, /basel/i, /lugano/i],
    "gre.1": [/super league greece/i, /slgr\.gr/i, /stoiximan/i, /olympiacos/i, /panathinaikos/i, /\bpaok\b/i, /\baek\b/i],
    "ltu.1": [/a lyga/i, /alyga\.lt/i, /lff\.lt/i, /zalgiris|žalgiris/i],
    "nor.1": [/eliteserien/i, /eliteserien\.no/i, /fotball\.no/i, /molde/i, /bodø|bodo/i, /rosenborg/i],
    "por.1": [/primeira liga/i, /ligaportugal/i, /liga portugal/i, /fpf\.pt/i, /benfica/i, /porto/i, /sporting/i],
    "rus.1": [/russian premier league/i, /premierliga/i, /rfpl/i, /rfs\.ru/i, /zenit/i, /spartak/i, /cska/i],
    "sco.1": [/scottish premiership/i, /spfl/i, /spfl\.co\.uk/i, /celtic/i, /rangers/i, /hibernian/i, /hearts/i],
    "tur.1": [/süper lig|super lig/i, /tff\.org/i, /galatasaray/i, /fenerbahce|fenerbahçe/i, /besiktas|beşiktaş/i],
    "ukr.1": [/ukrainian premier league/i, /upl\.ua/i, /uaf\.ua/i, /shakhtar/i, /dynamo kyiv|dinamo kyiv/i],
    "srb.1": [/serbian superliga/i, /superliga\.rs/i, /crvena/i, /partizan/i],
    "bel.1": [/belgian pro league/i, /proleague\.be/i, /jupiler/i],
    "esp.1": [/laliga/i, /liga/i, /rfef\.es/i]
  };

  return [...common, ...(bySlug[slug] || [])];
}

function officialHostPatterns(leagueSlug) {
  const bySlug = {
    "ned.1": [/eredivisie\.nl/i, /knvb\.nl/i],
    "pol.1": [/ekstraklasa\.org/i, /pzpn\.pl/i, /90minut\.pl/i],
    "sui.1": [/sfl\.ch/i, /football\.ch/i, /swissfootballleague/i],
    "gre.1": [/slgr\.gr/i, /epo\.gr/i],
    "ltu.1": [/alyga\.lt/i, /lff\.lt/i],
    "nor.1": [/eliteserien\.no/i, /fotball\.no/i],
    "por.1": [/ligaportugal\.pt/i, /fpf\.pt/i],
    "rus.1": [/premierliga\.ru/i, /rfs\.ru/i],
    "sco.1": [/spfl\.co\.uk/i, /scottishfa\.co\.uk/i],
    "tur.1": [/tff\.org/i],
    "ukr.1": [/upl\.ua/i, /uaf\.ua/i],
    "srb.1": [/superliga\.rs/i],
    "bel.1": [/proleague\.be/i],
    "esp.1": [/laliga\.com/i, /rfef\.es/i]
  };

  return bySlug[asText(leagueSlug).toLowerCase()] || [];
}

function findUrls(text) {
  return [...String(text || "").matchAll(/https?:\/\/[^"\\\s<>)]+/g)]
    .map((match) => match[0])
    .filter((url, index, arr) => arr.indexOf(url) === index);
}

function walk(value, patterns, rows = []) {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, patterns, rows);
    return rows;
  }

  if (value && typeof value === "object") {
    const text = JSON.stringify(value);
    if (patterns.some((rx) => rx.test(text))) {
      rows.push(value);
    }

    for (const child of Object.values(value)) {
      walk(child, patterns, rows);
    }
  }

  return rows;
}

function compactRow(row, sourceFile) {
  const text = JSON.stringify(row || {});
  const urls = findUrls(text);

  return {
    sourceFile,
    leagueSlug: row.leagueSlug || row.slug || row.league || row.leagueId || "",
    name: row.name || row.leagueName || row.competitionName || "",
    targetDate: row.targetDate || row.dayKey || row.date || row.localDate || "",
    status: row.analystStatus || row.status || row.state || row.evidenceState || row.decision || row.reason || "",
    sourceHost: row.hostname || row.host || row.sourceHost || row.checkedSource?.hostname || row.sourceEvidence?.hostname || row.fetch?.host || "",
    sourceUrl: row.url || row.sourceUrl || row.finalUrl || row.resolvedUrl || row.checkedSource?.url || row.sourceEvidence?.url || row.fetch?.finalUrl || "",
    sourceTitle: row.sourceTitle || row.title || "",
    homeTeam: row.homeTeam || "",
    awayTeam: row.awayTeam || "",
    rawKickoffText: row.rawKickoffText || "",
    localDate: row.localDate || "",
    localTime: row.localTime || "",
    kickoffUtc: row.kickoffUtc || "",
    extractionMethod: row.extractionMethod || "",
    urls: urls.slice(0, 20)
  };
}

function inspectArtifacts({ inputDir, leagueSlug, leagueName, targetDate }) {
  if (!fs.existsSync(inputDir)) throw new Error(`missing input directory: ${inputDir}`);

  const patterns = leaguePatterns(leagueSlug, leagueName);
  const officialPatterns = officialHostPatterns(leagueSlug);

  const files = fs.readdirSync(inputDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(inputDir, entry.name));

  const matchingFiles = [];

  for (const file of files) {
    let json;
    try {
      json = readJson(file);
    } catch {
      continue;
    }

    const rows = walk(json, patterns)
      .map((row) => compactRow(row, file))
      .filter((row) => patterns.some((rx) => rx.test(JSON.stringify(row))));

    if (rows.length > 0) {
      matchingFiles.push({
        file,
        rowCount: rows.length,
        rows: rows.slice(0, 25)
      });
    }
  }

  const allRows = matchingFiles.flatMap((item) => item.rows);
  const urls = allRows.flatMap((row) => row.urls || [])
    .filter((url, index, arr) => arr.indexOf(url) === index);

  const officialLikeUrls = urls.filter((url) =>
    officialPatterns.some((rx) => rx.test(url))
  );

  const likelyFixtureRows = allRows.filter((row) => {
    const text = JSON.stringify(row);
    const officialLike = officialPatterns.some((rx) => rx.test(text));
    const hasTargetDate = String(row.localDate || "") === targetDate || String(row.targetDate || "") === targetDate;
    const hasTeams = String(row.homeTeam || "").trim() && String(row.awayTeam || "").trim();
    return officialLike && hasTargetDate && hasTeams;
  });

  return {
    ok: true,
    job: "inspect-fixture-identity-existing-artifacts-compact-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_fixture_identity_existing_artifacts_compact_inspection",
    targetLeagueSlug: leagueSlug,
    targetLeagueName: leagueName,
    targetDate,
    sourceDir: inputDir,
    summary: {
      matchingFileCount: matchingFiles.length,
      compactRowCount: allRows.length,
      uniqueUrlCount: urls.length,
      officialLikeUrlCount: officialLikeUrls.length,
      likelyFixtureRowCount: likelyFixtureRows.length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    officialLikeUrls,
    likelyFixtureRows: likelyFixtureRows.slice(0, 100),
    matchingFiles,
    conclusion: likelyFixtureRows.length > 0
      ? "has_likely_rows_needing_homepage_noise_classification"
      : officialLikeUrls.length > 0
        ? "has_official_like_urls_but_no_confirmed_fixture_rows"
        : "no_official_like_candidate_found_in_existing_artifacts",
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
  const tmpDir = path.join("data", "football-truth", "_diagnostics", "fixture-acquisition-stability", "self-test-compact-inspector");

  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const inputFile = path.join(tmpDir, "sample.json");
  fs.writeFileSync(inputFile, `${JSON.stringify({
    rows: [
      {
        leagueSlug: "ned.1",
        name: "Eredivisie",
        sourceUrl: "https://eredivisie.nl/",
        homeTeam: "Samenvatting Ajax",
        awayTeam: "FC Utrecht",
        targetDate: "2026-05-22"
      },
      {
        leagueSlug: "gre.1",
        name: "Super League Greece",
        sourceUrl: "https://www.slgr.gr/el/schedule/",
        homeTeam: "AEK Athens",
        awayTeam: "Olympiacos",
        localDate: "2026-05-22",
        localTime: "19:00",
        kickoffUtc: "2026-05-22T16:00:00.000Z",
        rawKickoffText: "22.05.2026 19:00"
      }
    ]
  }, null, 2)}\n`, "utf8");

  const report = inspectArtifacts({
    inputDir: tmpDir,
    leagueSlug: "gre.1",
    leagueName: "Super League Greece",
    targetDate: "2026-05-22"
  });

  if (report.summary.matchingFileCount !== 1) {
    throw new Error(`self-test failed: expected 1 matching file, got ${report.summary.matchingFileCount}`);
  }

  if (report.summary.likelyFixtureRowCount !== 1) {
    throw new Error(`self-test failed: expected 1 likely fixture row, got ${report.summary.likelyFixtureRowCount}`);
  }

  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false || report.guarantees.noFetch !== true) {
    throw new Error("self-test failed: safety guarantees missing");
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });

  return report;
}

async function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "inspect-fixture-identity-existing-artifacts-compact-file",
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!args.inputDir) throw new Error("missing --input-dir");
  if (!args.output) throw new Error("missing --output");
  if (!args.leagueSlug) throw new Error("missing --league-slug");
  if (!args.leagueName) throw new Error("missing --league-name");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error("--date YYYY-MM-DD is required");
  }

  const report = inspectArtifacts({
    inputDir: args.inputDir,
    leagueSlug: args.leagueSlug,
    leagueName: args.leagueName,
    targetDate: args.date
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    conclusion: report.conclusion,
    guarantees: report.guarantees
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    job: "inspect-fixture-identity-existing-artifacts-compact-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
});
