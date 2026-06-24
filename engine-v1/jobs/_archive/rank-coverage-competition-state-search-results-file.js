#!/usr/bin/env node

import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const HARD_REJECT_HOST_PATTERNS = [
  /(^|\.)xnxx/i,
  /pornhub/i,
  /adult/i,
  /booking\.com$/i,
  /expedia\.com$/i,
  /hotel/i,
  /segur/i,
  /insurance/i,
  /investopedia\.com$/i,
  /financialpost\.com$/i,
  /corporatefinanceinstitute\.com$/i,
  /clarifycapital\.com$/i,
  /agorareal\.com$/i,
  /worldenvironmentday\.global$/i,
  /aide-sociale\.fr$/i,
  /mes-allocs\.fr$/i,
  /quelles-aides\.fr$/i,
  /mesdroitssociaux\.gouv\.fr$/i,
  /caf-fr-remboursement\.info$/i,
  /(^|\.)caf\.fr$/i,
  /connect\.caf\.fr$/i,
  /(^|\.)africafc\.org$/i,
  /play\.google\.com$/i,
  /afc-france\.org$/i,
  /afc-tg\.com$/i,
  /afc\.com\.tn$/i
];

const HARD_REJECT_TEXT_PATTERNS = [
  /porn|sex videos|xxx|xnxx|creampie|jav/i,
  /insurance|seguro|seguros|hotel|booking|expedia|mall of america|real estate|finance|lender|portfolio lender/i,
  /allocations familiales|allocataire|franceconnect|caf mon compte|aide sociale|pension alimentaire|mes droits sociaux|prime d’activité|droits sociaux|aides sociales/i,
  /associations familiales catholiques|stockage|construction|tunisie|agence el menzah|african forum and network on debt and development/i,
  /world environment day|climate change|environmental action/i
];

const TRUSTED_CROSSCHECK_HOSTS = [
  "kassiesa.net",
  "rsssf.org",
  "en.wikipedia.org",
  "www.wikipedia.org",
  "www.flashscore.com",
  "www.soccerway.com",
  "int.soccerway.com",
  "www.worldfootball.net",
  "www.11v11.com",
  "onefootball.com",
  "www.onefootball.com"
];

const GENERIC_LOW_TRUST_HOSTS = [
  "football.fandom.com",
  "likegoals.com",
  "wdsportz.com",
  "football-ticketshop.com",
  "sillyseason.com"
];

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
    targets: "",
    searchResults: "",
    output: "",
    maxPerTarget: 5,
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--targets") args.targets = argv[++i] || "";
    else if (arg.startsWith("--targets=")) args.targets = arg.slice("--targets=".length);
    else if (arg === "--search-results") args.searchResults = argv[++i] || "";
    else if (arg.startsWith("--search-results=")) args.searchResults = arg.slice("--search-results=".length);
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else if (arg === "--max-per-target") args.maxPerTarget = Number(argv[++i] || 5);
    else if (arg.startsWith("--max-per-target=")) args.maxPerTarget = Number(arg.slice("--max-per-target=".length));
    else throw new Error("unknown argument: " + arg);
  }

  if (!args.selfTest && !args.targets) throw new Error("--targets is required");
  if (!args.selfTest && !args.searchResults) throw new Error("--search-results is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");
  args.maxPerTarget = Number.isFinite(args.maxPerTarget) && args.maxPerTarget > 0 ? Math.floor(args.maxPerTarget) : 5;

  return args;
}

function getRows(json) {
  if (Array.isArray(json)) return json;
  for (const key of ["searchTargetRows", "searchTargets", "searchResultRows", "resultRows", "rankedCandidateUrlRows", "rows", "items"]) {
    if (Array.isArray(json && json[key])) return json[key];
  }
  return [];
}

function urlOf(row) {
  return asText(row.candidateUrl || row.url || row.link || row.href);
}

function titleOf(row) {
  return asText(row.title || row.name || row.headline);
}

function snippetOf(row) {
  return asText(row.snippet || row.description || row.text);
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function fullHostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function textBlob(row) {
  return [urlOf(row), titleOf(row), snippetOf(row)].join(" ").toLowerCase();
}

function targetKey(row) {
  return asText(row.searchTargetId || row.sourceSearchTargetId || row.targetId || row.id);
}

function buildTargetMap(targetReport) {
  const map = new Map();
  for (const row of getRows(targetReport)) {
    const key = targetKey(row);
    if (key) map.set(key, row);
  }
  return map;
}

function officialHostBoost(slug, host) {
  const cleanSlug = asText(slug);

  if (cleanSlug.startsWith("uefa.") && host.endsWith("uefa.com")) return 90;
  if (cleanSlug.startsWith("afc.") && host.endsWith("the-afc.com")) return 85;
  if (cleanSlug.startsWith("caf.") && (host.endsWith("cafonline.com") || host.endsWith("cafonline.com.ng") || host.endsWith("cafonline.com")) && /(^|\.)cafonline\.com(\.ng)?$/i.test(host)) return 85;
  if (cleanSlug.startsWith("concacaf.") && host.endsWith("concacaf.com")) return 85;
  if (cleanSlug.startsWith("conmebol.") && host.endsWith("conmebol.com")) return 85;
  if (cleanSlug.startsWith("fifa.") && host.endsWith("fifa.com")) return 85;

  return 0;
}

function sourceTypeBoost(targetType, host) {
  if (asText(targetType) === "official-primary") return 12;
  if (asText(targetType) === "official-federation-or-competition") return 10;
  if (TRUSTED_CROSSCHECK_HOSTS.includes(host)) return 8;
  return 0;
}

function isOfficialConfirmationMode(target, taskType, evidenceKind) {
  const policy = target && typeof target === "object" ? target.sourcePolicy || {} : {};
  return (
    policy.officialConfirmationOnly === true ||
    asText(target && target.validationIntent).includes("official") ||
    asText(taskType).includes("official_confirmation") ||
    asText(evidenceKind) === "winner_or_final_official_confirmation"
  );
}

function allowedOfficialHostsOf(target) {
  const policy = target && typeof target === "object" ? target.sourcePolicy || {} : {};
  const hosts = [
    ...asArray(policy.allowedHosts),
    ...asArray(target && target.officialHosts)
  ]
    .map((host) => asText(host).toLowerCase().replace(/^www\./, ""))
    .filter(Boolean);

  return [...new Set(hosts)];
}

function hostMatchesAllowedOfficialHost(host, allowedHosts) {
  const cleanHost = asText(host).toLowerCase().replace(/^www\./, "");
  return allowedHosts.some((allowed) => cleanHost === allowed || cleanHost.endsWith("." + allowed));
}

function officialConfirmationRejectionReason(row, target, host) {
  const allowedHosts = allowedOfficialHostsOf(target);
  const blob = textBlob(row);
  const url = urlOf(row).toLowerCase();
  const title = titleOf(row).toLowerCase();

  if (allowedHosts.length && !hostMatchesAllowedOfficialHost(host, allowedHosts)) {
    return "official_confirmation_non_official_host";
  }

  if (/\/home\.html(?:$|[?#])|\/home(?:$|[?#])|afc_champions_league_-_home/i.test(url)) {
    return "official_confirmation_generic_home_or_landing";
  }

  if (/\bpreview\b/i.test(blob) && !/\b\d+\s*[-–]\s*\d+\b/.test(blob)) {
    return "official_confirmation_preview_not_result";
  }

  if (/hails|fortitude|not at our best|facts\s*&\s*figures|in numbers|year in review/i.test(blob)) {
    if (!/\b(?:won|winner|champion|champions|title|2\s*[-–]\s*0|final\s*:)\b/i.test(blob)) {
      return "official_confirmation_context_article_not_result";
    }
  }

  const hasSpecificResultSignal =
    /\b\d+\s*[-–]\s*\d+\b/i.test(blob) ||
    /\b(?:won|winner|champion|champions|title|end title|final score|result|beat|defeated)\b/i.test(blob);

  const hasFinalSignal =
    /\bfinal\b/i.test(blob) ||
    /aclelitefinal/i.test(url);

  const hasTeamSignal =
    /al[\s-]?ahli|kawasaki|frontale/i.test(blob);

  if (!hasFinalSignal) {
    return "official_confirmation_missing_final_signal";
  }

  if (!hasSpecificResultSignal) {
    return "official_confirmation_missing_result_or_winner_signal";
  }

  if (!hasTeamSignal) {
    return "official_confirmation_missing_team_signal";
  }

  return "";
}
function evidenceTermScore(taskType, evidenceKind, row) {
  const text = textBlob(row);
  let score = 0;
  const reasons = [];

  function add(pattern, points, reason) {
    if (pattern.test(text)) {
      score += points;
      reasons.push(reason);
    }
  }

  if (taskType === "uefa_qualifier_calendar_search") {
    add(/qualifying|qualifier|preliminary|first qualifying|second qualifying|draw/i, 18, "qualifier_terms");
    add(/fixtures|results|schedule|calendar|dates|key dates/i, 16, "calendar_terms");
    add(/2025\/26|2025-26|2025 26|2026/i, 8, "season_terms");
    add(/uefa/i, 8, "uefa_terms");
  } else if (evidenceKind === "winner_or_final_official_confirmation" || asText(taskType).includes("official_confirmation")) {
    add(/\bfinal\b|aclelitefinal/i, 12, "final_terms");
    add(/\b\d+\s*[-–]\s*\d+\b|final\s*:|final score|result/i, 28, "result_score_terms");
    add(/\bwon|winner|champion|champions|title|end title|beat|defeated\b/i, 24, "winner_title_terms");
    add(/al[\s-]?ahli|kawasaki|frontale/i, 18, "team_terms");
    add(/match|report|video|final report/i, 8, "specific_page_type_terms");
    add(/2024\/25|2024-25|2025/i, 6, "season_terms");
  } else if (evidenceKind === "calendar") {
    add(/fixtures|schedule|calendar|dates|key dates|round dates|draw/i, 18, "calendar_terms");
    add(/season|2025\/26|2025-26|2026/i, 8, "season_terms");
  } else if (evidenceKind === "winner") {
    add(/winner|champion|champions|final|result|won|title/i, 22, "winner_terms");
    add(/2025\/26|2025-26|2026|season/i, 8, "season_terms");
  } else if (evidenceKind === "status") {
    add(/phase|round|fixtures|results|standings|current|format|teams/i, 18, "status_terms");
    add(/2025\/26|2025-26|2026|season/i, 8, "season_terms");
  } else if (evidenceKind === "standings") {
    add(/standings|table|points|played|league table|final table/i, 22, "standings_terms");
    add(/2025\/26|2025-26|2026|season/i, 8, "season_terms");
  }

  return { score, reasons };
}
function isHardRejected(row, host) {
  const fullHost = fullHostOf(urlOf(row));
  const blob = textBlob(row);

  for (const pattern of HARD_REJECT_HOST_PATTERNS) {
    if (pattern.test(fullHost) || pattern.test(host)) return { rejected: true, reason: "hard_rejected_host" };
  }

  for (const pattern of HARD_REJECT_TEXT_PATTERNS) {
    if (pattern.test(blob)) return { rejected: true, reason: "hard_rejected_text" };
  }

  return { rejected: false, reason: "" };
}

function scoreCandidate(row, target) {
  const url = urlOf(row);
  const host = hostnameOf(url);
  const slug = asText(row.competitionSlug || row.leagueSlug || target.competitionSlug || target.leagueSlug);
  const taskType = asText(row.taskType || target.taskType);
  const evidenceKind = asText(row.evidenceKind || target.evidenceKind);
  const targetType = asText(row.targetType || target.targetType);

  if (!url || !host) {
    return {
      accepted: false,
      score: 0,
      rejectionReason: "missing_url_or_host",
      scoreReasons: []
    };
  }

  const hard = isHardRejected(row, host);
  if (hard.rejected) {
    return {
      accepted: false,
      score: 0,
      rejectionReason: hard.reason,
      scoreReasons: []
    };
  }

  if (isOfficialConfirmationMode(target, taskType, evidenceKind)) {
    const officialConfirmationRejectReason = officialConfirmationRejectionReason(row, target, host);
    if (officialConfirmationRejectReason) {
      return {
        accepted: false,
        score: 0,
        rejectionReason: officialConfirmationRejectReason,
        scoreReasons: []
      };
    }
  }

  let score = 0;
  const scoreReasons = [];

  const officialBoost = officialHostBoost(slug, host);
  if (officialBoost > 0) {
    score += officialBoost;
    scoreReasons.push("official_host");
  }

  const sourceBoost = sourceTypeBoost(targetType, host);
  if (sourceBoost > 0) {
    score += sourceBoost;
    scoreReasons.push("target_type_or_trusted_crosscheck");
  }

  const terms = evidenceTermScore(taskType, evidenceKind, row);
  score += terms.score;
  scoreReasons.push(...terms.reasons);

  if (TRUSTED_CROSSCHECK_HOSTS.includes(host)) {
    score += 8;
    scoreReasons.push("trusted_crosscheck_host");
  }

  if (GENERIC_LOW_TRUST_HOSTS.includes(host)) {
    score -= 16;
    scoreReasons.push("generic_low_trust_penalty");
  }

  if (/wikipedia\.org$/i.test(host) && officialBoost === 0) {
    score -= 8;
    scoreReasons.push("wikipedia_reference_penalty");
  }

  if (/fandom\.com$/i.test(host)) {
    score -= 20;
    scoreReasons.push("fandom_penalty");
  }

  if (isOfficialConfirmationMode(target, taskType, evidenceKind)) {
    const nonHostReasons = scoreReasons.filter((reason) => reason !== "official_host");
    if (nonHostReasons.length === 0) {
      return {
        accepted: false,
        score,
        rejectionReason: "official_confirmation_official_host_only",
        scoreReasons
      };
    }
  }

  if (score <= 0) {
    return {
      accepted: false,
      score,
      rejectionReason: "non_positive_competition_state_score",
      scoreReasons
    };
  }

  return {
    accepted: true,
    score,
    rejectionReason: "",
    scoreReasons
  };
}

function dedupeRows(rows) {
  const seen = new Set();
  const out = [];

  for (const row of rows) {
    const key = [targetKey(row), urlOf(row).toLowerCase()].join("::");
    if (!urlOf(row) || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out;
}

function buildReport({ targetsReport, searchResultsReport, maxPerTarget = 5 }) {
  const targetMap = buildTargetMap(targetsReport);
  const inputRows = getRows(searchResultsReport);
  const accepted = [];
  const rejected = [];

  for (const row of inputRows) {
    const key = targetKey(row);
    const target = targetMap.get(key) || {};
    const scoring = scoreCandidate(row, target);

    const common = {
      searchTargetId: key,
      sourceSearchTargetId: key,
      targetType: asText(row.targetType || target.targetType),
      taskType: asText(row.taskType || target.taskType),
      evidenceKind: asText(row.evidenceKind || target.evidenceKind),
      validationIntent: asText(row.validationIntent || target.validationIntent),
      leagueSlug: asText(row.leagueSlug || target.leagueSlug || row.competitionSlug || target.competitionSlug),
      competitionSlug: asText(row.competitionSlug || target.competitionSlug || row.leagueSlug || target.leagueSlug),
      competitionName: asText(row.competitionName || target.competitionName || row.name || target.name),
      candidateUrl: urlOf(row),
      hostname: hostnameOf(urlOf(row)),
      title: titleOf(row),
      snippet: snippetOf(row),
      competitionStateScore: scoring.score,
      scoreReasons: scoring.scoreReasons,
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false
    };

    if (scoring.accepted) {
      accepted.push({
        ...common,
        rankingDecision: "accepted_for_competition_state_review",
        rejectionReason: ""
      });
    } else {
      rejected.push({
        ...common,
        rankingDecision: "rejected_from_competition_state_review",
        rejectionReason: scoring.rejectionReason
      });
    }
  }

  const deduped = dedupeRows(accepted)
    .sort((a, b) => {
      if (b.competitionStateScore !== a.competitionStateScore) return b.competitionStateScore - a.competitionStateScore;
      if (a.competitionSlug !== b.competitionSlug) return a.competitionSlug.localeCompare(b.competitionSlug);
      return a.candidateUrl.localeCompare(b.candidateUrl);
    });

  const perTarget = new Map();
  const ranked = [];

  for (const row of deduped) {
    const key = row.searchTargetId;
    const count = perTarget.get(key) || 0;
    if (count >= maxPerTarget) continue;
    perTarget.set(key, count + 1);
    ranked.push({
      ...row,
      rankWithinTarget: count + 1
    });
  }

  return {
    ok: true,
    job: "rank-coverage-competition-state-search-results-file",
    generatedAt: new Date().toISOString(),
    summary: {
      searchTargetCount: targetMap.size,
      searchResultInputCount: inputRows.length,
      acceptedCandidateUrlCount: accepted.length,
      dedupedAcceptedCandidateUrlCount: deduped.length,
      emittedCandidateUrlCount: ranked.length,
      rejectedResultCount: rejected.length,
      maxPerTarget,
      byCompetition: countBy(ranked, "competitionSlug"),
      byEvidenceKind: countBy(ranked, "evidenceKind"),
      byHost: countBy(ranked, "hostname"),
      byRejectionReason: countBy(rejected, "rejectionReason"),
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    rankedCandidateUrlRows: ranked,
    rejectedResultRows: rejected,
    guarantees: {
      noWebSearch: true,
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyProvidedSearchResults: true,
      noReviewDecisionApplied: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = asText(typeof key === "function" ? key(row) : row[key]) || "unknown";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function runSelfTest() {
  const targetsReport = {
    searchTargetRows: [
      {
        searchTargetId: "t1",
        targetType: "official-primary",
        taskType: "uefa_qualifier_calendar_search",
        evidenceKind: "calendar",
        leagueSlug: "uefa.champions",
        competitionSlug: "uefa.champions",
        competitionName: "UEFA Champions League"
      },
      {
        searchTargetId: "t2",
        targetType: "official-primary",
        taskType: "continental_winner_search",
        evidenceKind: "winner",
        leagueSlug: "caf.champions",
        competitionSlug: "caf.champions",
        competitionName: "CAF Champions League"
      }
    ]
  };

  const searchResultsReport = {
    searchResultRows: [
      {
        searchTargetId: "t1",
        leagueSlug: "uefa.champions",
        url: "https://www.uefa.com/uefachampionsleague/fixtures-results/2026/",
        title: "Fixtures & results | UEFA Champions League 2025/26",
        snippet: "Qualifying dates and fixtures"
      },
      {
        searchTargetId: "t2",
        leagueSlug: "caf.champions",
        url: "https://www.caf.fr/",
        title: "caf.fr allocations familiales",
        snippet: "allocataire pension alimentaire"
      },
      {
        searchTargetId: "t1",
        leagueSlug: "uefa.champions",
        url: "https://www.pornhub.com/",
        title: "Pornhub",
        snippet: "porn videos"
      },
      {
        searchTargetId: "t2",
        leagueSlug: "caf.champions",
        url: "https://www.mes-allocs.fr/guides/aides-sociales/caf/",
        title: "Mes allocs CAF aides sociales",
        snippet: "droits sociaux prime d’activité allocations familiales"
      },
      {
        searchTargetId: "t2",
        leagueSlug: "caf.champions",
        url: "https://www.africafc.org/",
        title: "African Forum and Network on Debt and Development",
        snippet: "AFRODAD debt development"
      }
    ]
  };

  const report = buildReport({ targetsReport, searchResultsReport });

  if (report.summary.emittedCandidateUrlCount !== 1) throw new Error("expected one accepted official UEFA URL");
  if (report.summary.rejectedResultCount !== 4) throw new Error("expected four rejected bad URLs");
  if (report.rankedCandidateUrlRows[0].hostname !== "uefa.com") throw new Error("expected UEFA host accepted");

  const officialConfirmationReport = buildReport({
    targetsReport: {
      searchTargetRows: [
        {
          searchTargetId: "afc.champions::official-confirmation::01",
          targetType: "competition-state-official-confirmation",
          taskType: "winner_final_official_confirmation_search",
          evidenceKind: "winner_or_final_official_confirmation",
          competitionSlug: "afc.champions",
          leagueSlug: "afc.champions",
          sourcePolicy: {
            officialConfirmationOnly: true,
            allowedHosts: ["the-afc.com"],
            requireSpecificWinnerOrFinalResult: true
          }
        }
      ]
    },
    searchResultsReport: {
      searchResultRows: [
        {
          searchTargetId: "afc.champions::official-confirmation::01",
          leagueSlug: "afc.champions",
          title: "AFC Champions League Elite - Al Ahli Saudi FC end title wait in style",
          url: "https://www.the-afc.com/en/club/afc_champions_league_elite.html/news/al-ahli-saudi-fc-end-title-wait-in-style",
          snippet: "Al Ahli beat Kawasaki Frontale 2-0 in the final and were crowned champions."
        },
        {
          searchTargetId: "afc.champions::official-confirmation::01",
          leagueSlug: "afc.champions",
          title: "AFC Champions League Elite - Final - Preview: Al Ahli Saudi FC v Kawasaki Frontale",
          url: "https://www.the-afc.com/en/club/afc_champions_league_elite.html/news/final-preview-al-ahli-saudi-fc-ksa-v-kawasaki-frontale-jpn",
          snippet: "Preview before the final."
        },
        {
          searchTargetId: "afc.champions::official-confirmation::01",
          leagueSlug: "afc.champions",
          title: "AFC Champions League Elite 2024/25",
          url: "https://www.the-afc.com/en/club/afc_champions_league_elite/home.html",
          snippet: "Competition home page."
        },
        {
          searchTargetId: "afc.champions::official-confirmation::01",
          leagueSlug: "afc.champions",
          title: "2025 AFC Champions League Elite final",
          url: "https://en.wikipedia.org/wiki/2025_AFC_Champions_League_Elite_final",
          snippet: "Reference page."
        }
      ]
    },
    maxPerTarget: 5
  });

  if (officialConfirmationReport.summary.emittedCandidateUrlCount !== 1) throw new Error("expected one official-confirmation accepted URL");
  if (officialConfirmationReport.summary.rejectedResultCount !== 3) throw new Error("expected three official-confirmation rejected URLs");
  if (officialConfirmationReport.rankedCandidateUrlRows[0].hostname !== "the-afc.com") throw new Error("expected AFC official host");
  if (officialConfirmationReport.rankedCandidateUrlRows[0].candidateUrl.includes("preview")) throw new Error("preview should not be accepted");
  if (officialConfirmationReport.rankedCandidateUrlRows[0].scoreReasons.length <= 1) throw new Error("official confirmation candidate must not be official_host only");
  if (report.guarantees.sourceFetch !== false || report.guarantees.canonicalWrites !== 0) throw new Error("read-only guarantees failed");

  return {
    ok: true,
    selfTest: "rank-coverage-competition-state-search-results-file",
    summary: report.summary
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const targetsReport = readJson(args.targets);
  const searchResultsReport = readJson(args.searchResults);
  const report = buildReport({ targetsReport, searchResultsReport, maxPerTarget: args.maxPerTarget });
  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: path.relative(repoRoot, args.output).replace(/\\/g, "/"),
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

if (path.resolve(process.argv[1] || "") === __filename) {
  main();
}

export { buildReport, scoreCandidate };