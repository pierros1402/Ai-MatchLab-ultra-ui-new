import fs from "fs";
import path from "path";

const root = process.cwd();
const auditsDir = path.join(root, "data", "team-news", "_source-map-audits");
const outJson = path.join(auditsDir, "_registry-patch-candidates.json");
const outDraft = path.join(auditsDir, "_registry-patch-draft.cjs");

function parseArgs(argv) {
  const out = {
    minScore: 65,
    maxCandidates: 200,
    leagues: null,
    strictNewsUrl: true
  };

  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--min-score=")) out.minScore = Number(arg.split("=")[1]);
    if (arg.startsWith("--max=")) out.maxCandidates = Number(arg.split("=")[1]);
    if (arg.startsWith("--leagues=")) {
      out.leagues = arg.split("=")[1].split(",").map(x => x.trim()).filter(Boolean);
    }
    if (arg === "--allow-homepage") out.strictNewsUrl = false;
  }

  return out;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function hostOf(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isSameOrSubdomain(candidateHost, finalHost) {
  if (!candidateHost || !finalHost) return false;
  return finalHost === candidateHost || finalHost.endsWith(`.${candidateHost}`);
}

function isStrictNewsUrl(url) {
  return /\/(news|noticias|nieuws|actualites|actualites?|notizie|nachrichten|blog|blogs|media)(\/|\?|#|$)/i.test(url);
}

function sourceTypeFromUrl(url) {
  if (isStrictNewsUrl(url)) return "official_club_news";
  return "official_club";
}

function teamAliases(team) {
  const base = normalizeText(team);
  const lower = base.toLowerCase();
  const slug = slugify(base).replace(/-/g, " ");

  const aliases = new Set([
    lower,
    slug,
    `${lower} fc`,
    `${slug} fc`
  ]);

  return Array.from(aliases).filter(Boolean);
}

function candidateFromRow(league, row) {
  const q = row.candidateQuality || {};
  const signals = q.signals || {};
  const best = row.bestCandidate || {};
  const url = normalizeText(best.finalUrl || best.url);
  const sourceHost = hostOf(url);
  const candidateHost = normalizeText(signals.candidateHost || sourceHost).replace(/^www\./, "");
  const finalHost = normalizeText(signals.finalHost || sourceHost).replace(/^www\./, "");
  const score = Number(best.score || 0);

  const reasons = [];

  if (!row.needsRegistrySource) reasons.push("team_already_has_registry_source");
  if (!row.bestCandidateRegistryReady) reasons.push("row_not_registry_ready");
  if (row.bestCandidateClassification !== "registry_ready") reasons.push("classification_not_registry_ready");
  if (q.classification !== "registry_ready") reasons.push("quality_not_registry_ready");
  if (q.registryReady !== true) reasons.push("quality_registry_ready_not_true");
  if (!url) reasons.push("missing_url");
  if (score < args.minScore) reasons.push(`score_below_${args.minScore}`);
  if (!signals.okStatus) reasons.push("not_ok_status");
  if (!signals.htmlLike) reasons.push("not_html_like");
  if (signals.parkingOrSale) reasons.push("parking_or_sale");
  if (signals.thirdPartyOrBadRedirect) reasons.push("third_party_or_bad_redirect");
  if (signals.nonFootballBusinessNoise) reasons.push("non_football_business_noise");
  if (!signals.footballIdentity) reasons.push("missing_football_identity");
  if (!signals.clubNewsSignal) reasons.push("missing_club_news_signal");
  if (!signals.enoughContent) reasons.push("insufficient_content");
  if (!signals.hasInterestingAnchors) reasons.push("missing_interesting_anchors");
  if (signals.noiseHeavy) reasons.push("noise_heavy");
  if (!isSameOrSubdomain(candidateHost || sourceHost, finalHost || sourceHost)) reasons.push("host_redirect_mismatch");
  if (args.strictNewsUrl && !isStrictNewsUrl(url)) reasons.push("not_strict_news_listing_url");

  return {
    ok: reasons.length === 0,
    rejectReasons: reasons,
    league,
    team: row.team,
    id: `${slugify(row.team)}-official-news`,
    label: `${row.team} official news`,
    type: sourceTypeFromUrl(url),
    trustTier: "official",
    teams: teamAliases(row.team),
    urls: [url],
    score,
    bestCandidateClassification: row.bestCandidateClassification,
    recommendedSourceAction: row.recommendedSourceAction,
    qualityReasons: Array.isArray(q.reasons) ? q.reasons : [],
    sourceHost,
    finalHost,
    textPreview: normalizeText(best.textPreview).slice(0, 300),
    sampleInterestingAnchors: Array.isArray(best.sampleInterestingAnchors) ? best.sampleInterestingAnchors.slice(0, 8) : []
  };
}

function blockForCandidate(c) {
  const teams = JSON.stringify(c.teams);
  const urls = JSON.stringify(c.urls);

  return `    {
      id: "${c.id}",
      label: "${c.label}",
      type: "${c.type}",
      trustTier: "${c.trustTier}",
      teams: ${teams},
      buildUrls() {
        return ${urls};
      }
    }`;
}

function buildDraft(candidates) {
  const grouped = new Map();
  for (const c of candidates) {
    if (!grouped.has(c.league)) grouped.set(c.league, []);
    grouped.get(c.league).push(c);
  }

  const serialized = JSON.stringify(candidates.map(c => ({
    league: c.league,
    id: c.id,
    block: blockForCandidate(c)
  })), null, 2);

  return `const fs = require("fs");

const file = "engine-v1/ai-match-intelligence/team-news-source-registry.js";
let s = fs.readFileSync(file, "utf8");

const candidates = ${serialized};

function assertAbsent(label, needle) {
  if (s.includes(needle)) throw new Error(label + ": already exists");
}

function findLeagueStart(league) {
  const needle = '  "' + league + '": [';
  const idx = s.indexOf(needle);
  if (idx < 0) return -1;
  if (s.indexOf(needle, idx + needle.length) >= 0) throw new Error(league + ": duplicate start found");
  return idx;
}

function findNextLeagueStart(fromIndex) {
  const re = /\\n  "[^"]+": \\[/g;
  re.lastIndex = fromIndex + 1;
  const m = re.exec(s);
  if (!m) return -1;
  return m.index;
}

function appendToExistingLeague(league, blocks) {
  const start = findLeagueStart(league);
  if (start < 0) return false;

  const next = findNextLeagueStart(start);
  const end = next >= 0 ? next : s.length;
  const segment = s.slice(start, end);

  const normalClose = "\\n  ],";
  const compactClose = "    }],";
  const insert = ",\\n" + blocks.join(",\\n");

  if (segment.includes(normalClose)) {
    const absoluteClose = start + segment.lastIndexOf(normalClose);
    s = s.slice(0, absoluteClose) + insert + s.slice(absoluteClose);
    return true;
  }

  if (segment.includes(compactClose)) {
    const absoluteClose = start + segment.lastIndexOf(compactClose);
    s = s.slice(0, absoluteClose) + "    }" + insert + "\\n  ]," + s.slice(absoluteClose + compactClose.length);
    return true;
  }

  throw new Error(league + ": no recognized closing found");
}

function insertNewLeagueBefore(anchorLeague, league, blocks) {
  const anchor = '\\n  "' + anchorLeague + '": [';
  const count = s.split(anchor).length - 1;
  if (count !== 1) throw new Error("anchor " + anchorLeague + ": expected 1 match, found " + count);

  const leagueBlock = '  "' + league + '": [\\n' + blocks.join(",\\n") + '\\n  ],\\n';
  s = s.replace(anchor, "\\n" + leagueBlock + anchor);
}

const byLeague = new Map();
for (const c of candidates) {
  assertAbsent(c.id, 'id: "' + c.id + '"');
  if (!byLeague.has(c.league)) byLeague.set(c.league, []);
  byLeague.get(c.league).push(c.block);
}

for (const [league, blocks] of byLeague.entries()) {
  const appended = appendToExistingLeague(league, blocks);
  if (!appended) {
    insertNewLeagueBefore("esp.2", league, blocks);
  }
}

fs.writeFileSync(file, s, "utf8");
console.log("patched " + file + " with " + candidates.length + " official source candidates");
`;
}

const args = parseArgs(process.argv);

if (!fs.existsSync(auditsDir)) {
  throw new Error(`missing audits directory: ${auditsDir}`);
}

const files = fs.readdirSync(auditsDir)
  .filter(name => name.endsWith(".json"))
  .filter(name => !name.startsWith("_"))
  .sort();

const selectedFiles = files.filter(name => {
  if (!args.leagues) return true;
  return args.leagues.includes(name.replace(/\.json$/i, ""));
});

const accepted = [];
const rejected = [];

for (const name of selectedFiles) {
  const league = name.replace(/\.json$/i, "");
  const full = path.join(auditsDir, name);
  const json = readJson(full);
  const rows = Array.isArray(json.rows) ? json.rows : [];

  for (const row of rows) {
    const rawLooksReady =
      row &&
      row.needsRegistrySource === true &&
      row.bestCandidateRegistryReady === true;

    if (!rawLooksReady) continue;

    const c = candidateFromRow(league, row);
    if (c.ok) accepted.push(c);
    else rejected.push(c);
  }
}

accepted.sort((a, b) => {
  if (a.league !== b.league) return a.league.localeCompare(b.league);
  if (b.score !== a.score) return b.score - a.score;
  return a.team.localeCompare(b.team);
});

const limitedAccepted = accepted.slice(0, args.maxCandidates);

const output = {
  ok: true,
  generatedAt: new Date().toISOString(),
  auditsDir: path.relative(root, auditsDir).replace(/\\\\/g, "/"),
  selectedAuditFiles: selectedFiles,
  settings: args,
  acceptedCount: limitedAccepted.length,
  rejectedReadyCount: rejected.length,
  accepted: limitedAccepted,
  rejectedReady: rejected
};

fs.writeFileSync(outJson, JSON.stringify(output, null, 2) + "\n", "utf8");
fs.writeFileSync(outDraft, buildDraft(limitedAccepted), "utf8");

console.log(JSON.stringify({
  ok: true,
  selectedAuditFiles: selectedFiles.length,
  acceptedCount: limitedAccepted.length,
  rejectedReadyCount: rejected.length,
  outputJson: path.relative(root, outJson).replace(/\\\\/g, "/"),
  outputDraft: path.relative(root, outDraft).replace(/\\\\/g, "/"),
  accepted: limitedAccepted.map(c => ({
    league: c.league,
    team: c.team,
    url: c.urls[0],
    score: c.score
  }))
}, null, 2));
