#!/usr/bin/env node
/*
  Build UEFA LOI AJAX normalized rows.

  Source scope:
  - irl.1 League of Ireland Premier Division: fixtures + results
  - irl.2 League of Ireland First Division: results only
  - irl.2 fixtures are explicitly blocked because the official AJAX fixture endpoint returns 500 for First Division
    and returns Premier Division rows when forced to competition=1.

  Guarantees:
  - No search
  - No fetch in this normalizer; it consumes controlled diagnostic AJAX payloads
  - No canonical writes
  - No production writes
*/
import fs from "node:fs";

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : "";
};

const input = getArg("--input");
const repairInput = getArg("--repair-input");
const output = getArg("--output");

if (!input) throw new Error("missing --input");
if (!repairInput) throw new Error("missing --repair-input");
if (!output) throw new Error("missing --output");

const source = JSON.parse(fs.readFileSync(input, "utf8"));
const repair = JSON.parse(fs.readFileSync(repairInput, "utf8"));

const stripHtml = (html) => String(html || "")
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"')
  .replace(/&#039;/g, "'")
  .replace(/&#39;/g, "'")
  .replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const dateRe = /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}\b/g;

const parseDateParts = (dateText) => {
  const m = String(dateText || "").match(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})$/);
  if (!m) return { isoDate: "", year: "" };

  const months = {
    January: "01",
    February: "02",
    March: "03",
    April: "04",
    May: "05",
    June: "06",
    July: "07",
    August: "08",
    September: "09",
    October: "10",
    November: "11",
    December: "12"
  };

  const dd = String(m[2]).padStart(2, "0");
  const mm = months[m[3]] || "";
  return {
    isoDate: mm ? `${m[4]}-${mm}-${dd}` : "",
    year: m[4]
  };
};

const splitDateSections = (text) => {
  const matches = [...text.matchAll(dateRe)];
  const sections = [];

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    sections.push({
      dateText: matches[i][0],
      body: text.slice(start + matches[i][0].length, end).trim()
    });
  }

  return sections;
};

const knownByCompetition = {
  "irl.1": {
    leagueLabel: "Premier Division",
    teams: [
      "Bohemians",
      "Derry City",
      "Drogheda United",
      "Dundalk",
      "Galway United",
      "Shamrock Rovers",
      "Shelbourne",
      "Sligo Rovers",
      "St Patrick's Athletic",
      "Waterford"
    ]
  },
  "irl.2": {
    leagueLabel: "SSE Airtricity Men's First Division 2026",
    teams: [
      "Athlone Town AFC",
      "Bray Wanderers FC",
      "Cobh Ramblers FC",
      "Cork City FC",
      "Finn Harps FC",
      "Kerry FC",
      "Longford Town FC",
      "Treaty United FC",
      "UCD AFC",
      "Wexford FC"
    ]
  }
};

const venueStopWords = [
  "Buy tickets",
  "videocam_FILL0_wght400_GRAD0_opsz24",
  "Match highlights",
  "stadium_FILL0_wght400_GRAD0_opsz48",
  "Copy 3",
  "Match centre"
];

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findNextTeamMatch = (body, teams, fromIndex) => {
  let best = null;

  for (const home of teams) {
    const token = `${home} vs `;
    const index = body.indexOf(token, fromIndex);
    if (index < 0) continue;

    if (!best || index < best.index) {
      best = { index, home };
    }
  }

  return best;
};

const parseFixtureSection = ({ competition, pageKind, variantLabel, dateText, body }) => {
  const cfg = knownByCompetition[competition];
  if (!cfg) return [];

  const rows = [];
  let cursor = 0;
  const { isoDate, year } = parseDateParts(dateText);

  while (cursor < body.length) {
    const match = findNextTeamMatch(body, cfg.teams, cursor);
    if (!match) break;

    const afterHome = match.index + `${match.home} vs `.length;

    let away = "";
    for (const t of cfg.teams) {
      if (body.startsWith(t, afterHome)) {
        away = t;
        break;
      }
    }

    if (!away) {
      cursor = afterHome;
      continue;
    }

    const afterAway = afterHome + away.length;
    const labelIndex = body.indexOf(cfg.leagueLabel, afterAway);
    if (labelIndex < 0 || labelIndex - afterAway > 200) {
      cursor = afterAway;
      continue;
    }

    const afterLabel = labelIndex + cfg.leagueLabel.length;
    const timeMatch = body.slice(afterLabel).match(/\b(\d{1,2}:\d{2})\b/);
    if (!timeMatch) {
      cursor = afterLabel;
      continue;
    }

    const timeIndex = afterLabel + timeMatch.index;
    const time = timeMatch[1];
    const venueStart = timeIndex + time.length;

    let nextCut = body.length;
    const nextTeam = findNextTeamMatch(body, cfg.teams, venueStart);
    if (nextTeam) nextCut = Math.min(nextCut, nextTeam.index);
    const nextDate = body.slice(venueStart).search(dateRe);
    if (nextDate >= 0) nextCut = Math.min(nextCut, venueStart + nextDate);

    let tail = body.slice(venueStart, nextCut).trim();
    for (const stop of venueStopWords) {
      const idx = tail.indexOf(stop);
      if (idx >= 0) tail = tail.slice(0, idx).trim();
    }

    const row = {
      competition,
      pageKind,
      source: "leagueofireland_ajax",
      variantLabel,
      status: "scheduled",
      dateText,
      isoDate,
      kickoffLocal: isoDate && time ? `${isoDate}T${time}:00` : "",
      seasonYear: year,
      homeTeam: match.home,
      awayTeam: away,
      leagueLabel: cfg.leagueLabel,
      venue: tail,
      homeScore: null,
      awayScore: null
    };

    rows.push(row);
    cursor = venueStart;
  }

  return rows;
};

const parseResultSection = ({ competition, pageKind, variantLabel, dateText, body }) => {
  const cfg = knownByCompetition[competition];
  if (!cfg) return [];

  const rows = [];
  let cursor = 0;
  const { isoDate, year } = parseDateParts(dateText);

  while (cursor < body.length) {
    const match = findNextTeamMatch(body, cfg.teams, cursor);
    if (!match) break;

    const afterHome = match.index + `${match.home} vs `.length;

    let away = "";
    for (const t of cfg.teams) {
      if (body.startsWith(t, afterHome)) {
        away = t;
        break;
      }
    }

    if (!away) {
      cursor = afterHome;
      continue;
    }

    const afterAway = afterHome + away.length;
    const labelIndex = body.indexOf(cfg.leagueLabel, afterAway);
    if (labelIndex < 0 || labelIndex - afterAway > 220) {
      cursor = afterAway;
      continue;
    }

    const afterLabel = labelIndex + cfg.leagueLabel.length;
    const timeMatch = body.slice(afterLabel).match(/\b(\d{1,2}:\d{2})\b/);
    if (!timeMatch) {
      cursor = afterLabel;
      continue;
    }

    const timeIndex = afterLabel + timeMatch.index;
    const time = timeMatch[1];

    const afterTime = timeIndex + time.length;
    const scoreMatch = body.slice(afterTime).match(/\s(\d{1,2})\s+(\d{1,2})\b/);
    if (!scoreMatch) {
      cursor = afterTime;
      continue;
    }

    const scoreIndex = afterTime + scoreMatch.index;
    let venue = body.slice(afterTime, scoreIndex).trim();

    for (const stop of venueStopWords) {
      const idx = venue.indexOf(stop);
      if (idx >= 0) venue = venue.slice(0, idx).trim();
    }

    const row = {
      competition,
      pageKind,
      source: "leagueofireland_ajax",
      variantLabel,
      status: "finished",
      dateText,
      isoDate,
      kickoffLocal: isoDate && time ? `${isoDate}T${time}:00` : "",
      seasonYear: year,
      homeTeam: match.home,
      awayTeam: away,
      leagueLabel: cfg.leagueLabel,
      venue,
      homeScore: Number(scoreMatch[1]),
      awayScore: Number(scoreMatch[2])
    };

    rows.push(row);
    cursor = scoreIndex + scoreMatch[0].length;
  }

  return rows;
};

const normalizedRows = [];
const parseDiagnostics = [];

for (const row of source.fullRows || []) {
  const text = stripHtml(row.html || "");
  const sections = splitDateSections(text);

  let parsed = [];

  if (row.pageKind === "fixtures") {
    parsed = sections.flatMap((section) => parseFixtureSection({
      competition: row.competition,
      pageKind: row.pageKind,
      variantLabel: row.variantLabel,
      dateText: section.dateText,
      body: section.body
    }));
  } else if (row.pageKind === "results") {
    parsed = sections.flatMap((section) => parseResultSection({
      competition: row.competition,
      pageKind: row.pageKind,
      variantLabel: row.variantLabel,
      dateText: section.dateText,
      body: section.body
    }));
  }

  normalizedRows.push(...parsed);

  parseDiagnostics.push({
    competition: row.competition,
    pageKind: row.pageKind,
    variantLabel: row.variantLabel,
    status: row.status,
    htmlLength: row.htmlLength,
    dateSectionCount: sections.length,
    parsedRowCount: parsed.length,
    firstTextPrefix: text.slice(0, 500)
  });
}

const falseIrl2Fixtures = normalizedRows.filter((r) =>
  r.competition === "irl.2" &&
  r.pageKind === "fixtures" &&
  /Premier Division/i.test(r.leagueLabel)
);

const irl2FixtureRepairSummary = repair.summary || {};
const irl2FixtureBlocked =
  Number(irl2FixtureRepairSummary.usableFirstDivisionFixtureVariantCount || 0) === 0;

const byCompetition = {};
const byCompetitionPageKind = {};

for (const r of normalizedRows) {
  byCompetition[r.competition] = (byCompetition[r.competition] || 0) + 1;

  const key = `${r.competition}|${r.pageKind}`;
  byCompetitionPageKind[key] = (byCompetitionPageKind[key] || 0) + 1;
}

const teamsByCompetition = {};
for (const r of normalizedRows) {
  if (!teamsByCompetition[r.competition]) teamsByCompetition[r.competition] = new Set();
  teamsByCompetition[r.competition].add(r.homeTeam);
  teamsByCompetition[r.competition].add(r.awayTeam);
}

const outputObj = {
  ok: true,
  input,
  repairInput,
  output,
  normalizedRows,
  parseDiagnostics,
  blocked: {
    irl2Fixtures: irl2FixtureBlocked,
    reason: irl2FixtureBlocked
      ? "official_ajax_fixture_endpoint_returns_500_for_first_division_and_premier_fallback_when_forced_competition_1"
      : ""
  },
  validation: {
    falseIrl2FixturesCount: falseIrl2Fixtures.length,
    invalidFalseIrl2FixturesBlocked: falseIrl2Fixtures.length === 0,
    irl2FixtureRepairUsableCount: Number(irl2FixtureRepairSummary.usableFirstDivisionFixtureVariantCount || 0)
  },
  summary: {
    normalizedRowCount: normalizedRows.length,
    resultRows: normalizedRows.filter((r) => r.status === "finished").length,
    scheduledRows: normalizedRows.filter((r) => r.status === "scheduled").length,
    byCompetition,
    byCompetitionPageKind,
    teamsByCompetition: Object.fromEntries(
      Object.entries(teamsByCompetition).map(([k, v]) => [k, [...v].sort()])
    )
  },
  guarantees: {
    sourceFetch: false,
    noFetch: true,
    noSearch: true,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    diagnosticOnly: false
  }
};

fs.writeFileSync(output, JSON.stringify(outputObj, null, 2));

console.log(JSON.stringify({
  ok: true,
  output,
  summary: outputObj.summary,
  blocked: outputObj.blocked,
  validation: outputObj.validation,
  compactDiagnostics: parseDiagnostics.map((d) => ({
    competition: d.competition,
    pageKind: d.pageKind,
    variantLabel: d.variantLabel,
    status: d.status,
    htmlLength: d.htmlLength,
    dateSectionCount: d.dateSectionCount,
    parsedRowCount: d.parsedRowCount
  })),
  samples: {
    firstRows: normalizedRows.slice(0, 10),
    lastRows: normalizedRows.slice(-10)
  },
  guarantees: outputObj.guarantees
}, null, 2));

if (falseIrl2Fixtures.length > 0) {
  throw new Error(`false irl.2 Premier fixture rows leaked into normalized output: ${falseIrl2Fixtures.length}`);
}

