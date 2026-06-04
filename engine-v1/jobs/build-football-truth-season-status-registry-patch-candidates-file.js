import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    registry: "engine-v1/ai-match-intelligence/team-news-source-registry.js",
    output: "",
    minScore: 120,
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = String(argv[++i] || "").trim();
    else if (arg.startsWith("--input=")) args.input = arg.slice("--input=".length);
    else if (arg === "--registry") args.registry = String(argv[++i] || "").trim();
    else if (arg.startsWith("--registry=")) args.registry = arg.slice("--registry=".length);
    else if (arg === "--output") args.output = String(argv[++i] || "").trim();
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else if (arg === "--min-score") args.minScore = Number(argv[++i] || 120);
    else if (arg.startsWith("--min-score=")) args.minScore = Number(arg.slice("--min-score=".length));
    else throw new Error(`unknown argument: ${arg}`);
  }

  if (!args.selfTest && !args.input) throw new Error("--input is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");

  args.minScore = Number.isFinite(args.minScore) ? args.minScore : 120;
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(repoRoot, filePath), "utf8"));
}

function readText(filePath) {
  return fs.readFileSync(path.resolve(repoRoot, filePath), "utf8");
}

function writeJson(filePath, value) {
  const resolved = path.resolve(repoRoot, filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function slugOf(row) {
  return asText(row.competitionSlug || row.leagueSlug || row.targetLeagueSlug || row.slug);
}

function acceptedRowsFrom(input) {
  const rows = Array.isArray(input?.rankedCandidateUrlRows)
    ? input.rankedCandidateUrlRows
    : Array.isArray(input?.acceptedCandidateUrlRows)
      ? input.acceptedCandidateUrlRows
      : Array.isArray(input?.rows)
        ? input.rows
        : [];

  const seen = new Set();
  const out = [];

  for (const row of rows) {
    const slug = slugOf(row);
    const url = asText(row.candidateUrl || row.finalUrl || row.resolvedUrl || row.url);
    if (!slug || !url) continue;

    const key = `${slug}|${url}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out;
}

function normalizeHost(host) {
  return asText(host).toLowerCase().replace(/^www\./, "");
}

function hostnameOf(row) {
  const host = normalizeHost(row.hostname);
  if (host) return host;

  try {
    return normalizeHost(new URL(asText(row.candidateUrl || row.finalUrl || row.resolvedUrl)).hostname);
  } catch {
    return "";
  }
}

function cleanIdPart(value) {
  return asText(value)
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function sourceTypeFor(row) {
  const family = asText(row.competitionFamily).toLowerCase();
  const type = asText(row.competitionType).toLowerCase();

  if (family.includes("cup") || type === "cup") return "competition_news";
  if (family.includes("continental") || family.includes("global") || type === "continental" || type === "global") return "competition_news";

  return "league_news";
}

function labelFor(row) {
  const name = asText(row.competitionName || row.name || slugOf(row));
  const type = sourceTypeFor(row) === "competition_news" ? "official competition source" : "official league source";
  return `${name} ${type}`;
}

function sourceIdFor(row) {
  const slug = slugOf(row);
  const host = hostnameOf(row);
  const classPart = sourceTypeFor(row).replace(/_/g, "-");
  return `${cleanIdPart(slug)}-${cleanIdPart(host)}-${classPart}`;
}

function registryExistingIds(registryText) {
  return new Set([...registryText.matchAll(/id:\s*["']([^"']+)["']/g)].map((m) => m[1]));
}

function registryExistingUrls(registryText) {
  return new Set([...registryText.matchAll(/["'](https?:\/\/[^"']+)["']/g)].map((m) => m[1].toLowerCase()));
}

function registryExistingSlugs(registryText) {
  return new Set([...registryText.matchAll(/^\s*["']([^"']+)["']\s*:\s*\[/gm)].map((m) => m[1]));
}

function jsString(value) {
  return JSON.stringify(asText(value));
}

function buildSourceBlock(row) {
  const id = sourceIdFor(row);
  const label = labelFor(row);
  const type = sourceTypeFor(row);
  const url = asText(row.candidateUrl || row.finalUrl || row.resolvedUrl);

  return `    {
      id: ${jsString(id)},
      label: ${jsString(label)},
      type: ${jsString(type)},
      trustTier: "league",
      buildUrls() {
        return [
          ${jsString(url)}
        ];
      }
    }`;
}

function buildRegistryEntryBlock(slug, rows) {
  return `  ${jsString(slug)}: [
${rows.map(buildSourceBlock).join(",\n")}
  ]`;
}

function buildAppendDraft(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const slug = slugOf(row);
    if (!grouped.has(slug)) grouped.set(slug, []);
    grouped.get(slug).push(row);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slug, groupedRows]) => buildRegistryEntryBlock(slug, groupedRows))
    .join(",\n\n");
}

function buildReport(input, registryText, options = {}) {
  const minScore = Number(options.minScore ?? 120);
  const existingIds = registryExistingIds(registryText);
  const existingUrls = registryExistingUrls(registryText);
  const existingSlugs = registryExistingSlugs(registryText);
  const rows = acceptedRowsFrom(input);

  const accepted = [];
  const rejected = [];

  for (const row of rows) {
    const slug = slugOf(row);
    const url = asText(row.candidateUrl || row.finalUrl || row.resolvedUrl || row.url);
    const host = hostnameOf(row);
    const sourceId = sourceIdFor(row);
    const score = Number(row.compositeScore || 0);
    const rejectionReasons = [];

    if (!slug) rejectionReasons.push("missing_slug");
    if (!url) rejectionReasons.push("missing_url");
    if (!host) rejectionReasons.push("missing_hostname");
    if (score < minScore) rejectionReasons.push("below_min_score");
    if (existingIds.has(sourceId)) rejectionReasons.push("duplicate_source_id");
    if (existingUrls.has(url.toLowerCase())) rejectionReasons.push("duplicate_source_url");

    const out = {
      leagueSlug: slug,
      competitionSlug: slug,
      competitionName: asText(row.competitionName || row.name),
      country: asText(row.country),
      region: asText(row.region),
      competitionFamily: asText(row.competitionFamily),
      competitionType: asText(row.competitionType),
      sourceId,
      label: labelFor(row),
      type: sourceTypeFor(row),
      trustTier: "league",
      candidateUrl: url,
      hostname: host,
      compositeScore: score,
      scoreReasons: Array.isArray(row.scoreReasons) ? row.scoreReasons : [],
      urlClass: asText(row.urlClass),
      existingRegistrySlug: existingSlugs.has(slug),
      patchMode: existingSlugs.has(slug) ? "append_source_to_existing_slug" : "create_new_league_source_registry_slug",
      sourceBlock: buildSourceBlock(row),
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    };

    if (rejectionReasons.length) {
      rejected.push({
        ...out,
        rejectionReasons
      });
    } else {
      accepted.push(out);
    }
  }

  const draftRows = accepted.map((row) => ({
    leagueSlug: row.leagueSlug,
    sourceId: row.sourceId,
    sourceBlock: row.sourceBlock,
    patchMode: row.patchMode
  }));

  const acceptedSourceRows = accepted.map((row) => ({
    leagueSlug: row.leagueSlug,
    competitionName: row.competitionName,
    sourceId: row.sourceId,
    label: row.label,
    type: row.type,
    trustTier: row.trustTier,
    candidateUrl: row.candidateUrl,
    hostname: row.hostname,
    patchMode: row.patchMode,
    compositeScore: row.compositeScore,
    urlClass: row.urlClass
  }));

  return {
    ok: true,
    job: "build-football-truth-season-status-registry-patch-candidates-file",
    mode: "read_only_registry_patch_candidate_report",
    generatedAt: new Date().toISOString(),
    options: {
      minScore
    },
    summary: {
      inputAcceptedCandidateRowCount: rows.length,
      acceptedRegistryPatchCandidateCount: accepted.length,
      rejectedRegistryPatchCandidateCount: rejected.length,
      createNewSlugCount: accepted.filter((row) => row.patchMode === "create_new_league_source_registry_slug").length,
      appendExistingSlugCount: accepted.filter((row) => row.patchMode === "append_source_to_existing_slug").length,
      byLeague: accepted.reduce((acc, row) => {
        acc[row.leagueSlug] = (acc[row.leagueSlug] || 0) + 1;
        return acc;
      }, {}),
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      noRegistryWrites: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    guarantees: {
      readsOnlyAcceptedRegistryEnrichmentRows: true,
      noWebSearch: true,
      noSearch: true,
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noRegistryWrites: true,
      noReviewDecisionApplied: true,
      noCanonicalPromotion: true,
      noFixtureWrites: true,
      noHistoryWrites: true,
      noValueWrites: true,
      noDetailsWrites: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true
    },
    notes: [
      "This job does not edit team-news-source-registry.js.",
      "registryPatchDraftText is a review artifact only.",
      "Apply registry changes only after separate review/validation."
    ],
    acceptedRegistryPatchCandidateRows: acceptedSourceRows,
    rejectedRegistryPatchCandidateRows: rejected,
    registryPatchDraftRows: draftRows,
    registryPatchDraftText: buildAppendDraft(accepted)
  };
}

function runSelfTest() {
  const input = {
    rankedCandidateUrlRows: [
      {
        leagueSlug: "bel.1",
        competitionSlug: "bel.1",
        competitionName: "Belgian Pro League",
        competitionFamily: "domestic_league",
        competitionType: "league",
        candidateUrl: "https://www.proleague.be/fr/jupliler-pro-league-20252026-kalender",
        hostname: "proleague.be",
        compositeScore: 177,
        urlClass: "fixture_calendar_or_competition_specific",
        scoreReasons: ["expected_official_host"]
      },
      {
        leagueSlug: "low.1",
        competitionSlug: "low.1",
        competitionName: "Low Score",
        competitionFamily: "domestic_league",
        competitionType: "league",
        candidateUrl: "https://low.example.com/",
        hostname: "low.example.com",
        compositeScore: 10
      }
    ]
  };

  const registry = `
const LEAGUE_SOURCE_REGISTRY = {
  "eng.1": [
    {
      id: "premierleague-news",
      label: "Premier League official news",
      type: "league_news",
      trustTier: "league",
      buildUrls() { return ["https://www.premierleague.com/en/news"]; }
    }
  ]
};
`;

  const report = buildReport(input, registry, { minScore: 120 });

  if (report.summary.acceptedRegistryPatchCandidateCount !== 1) throw new Error("expected one accepted patch candidate");
  if (report.summary.rejectedRegistryPatchCandidateCount !== 1) throw new Error("expected one rejected patch candidate");
  if (!report.acceptedRegistryPatchCandidateRows[0].sourceId.includes("bel-1-proleague-be")) throw new Error("expected normalized source id");
  if (!report.registryPatchDraftText.includes('"bel.1"')) throw new Error("expected bel.1 draft block");
  if (!report.registryPatchDraftText.includes("buildUrls()")) throw new Error("expected buildUrls draft");
  if (report.guarantees.noRegistryWrites !== true || report.guarantees.canonicalWrites !== 0) throw new Error("read-only guarantees failed");

  return {
    ok: true,
    selfTest: "build-football-truth-season-status-registry-patch-candidates-file",
    summary: report.summary,
    guarantees: report.guarantees
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const report = buildReport(readJson(args.input), readText(args.registry), {
    minScore: args.minScore
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

main();