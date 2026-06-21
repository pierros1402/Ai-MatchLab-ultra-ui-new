import { searchWeb } from "./web-search-provider.js";
import { computeRecheckAfter } from "../storage/league-memory-db.js";

// ─── Signal patterns ───────────────────────────────────────────────────────────
// Applied to titles, snippets, AND URLs combined.
// Snippets from DuckDuckGo HTML are often empty — titles and URLs carry the signal.

const ACTIVE_SIGNALS = [
  /matchday\s*\d+/i,
  /gameweek\s*\d+/i,
  /jornada\s*\d+/i,
  /journée\s*\d+/i,
  /spieltag\s*\d+/i,
  /gw\s*\d+/i,
  /round\s*\d+\s*(?:of|fixture)/i,
  /live\s+(?:match|score|stream|result)/i,
  /(?:today|tonight|this\s+weekend)[''s]*\s+(?:match|game|fixture)/i,
  /next\s+(?:match|fixture|game)/i,
  /upcoming\s+match/i,
  /(?:kick[- ]?off|ko)\s+\d{1,2}:\d{2}/i,
  /table\s+after\s+\d+\s+(?:match|game|round)/i
];

const PAUSE_SIGNALS = [
  /world\s*cup/i,
  /fifa\s*(?:world\s*cup|wc)/i,
  /copa\s*mundial/i,
  /wm\s*202[0-9]/i,
  /fifaworldcup/i,
  /worldcupnews/i,
  /worldcup202/i,
  /international\s+(?:break|window|duty)/i,
  /(?:winter|summer|mid[-\s]?season)\s+break/i,
  /pausa\s+(?:por|invernal|mundial)/i,
  /tr[eê]ve\s+(?:hivernale|internationale)/i,
  /winterpause/i,
  /resumes?\s+(?:in|on|after)/i,
  /restarts?\s+(?:in|on|after)/i,
  /returns?\s+(?:in|on|after)/i,
  /suspended?\s+(?:for|due)/i
];

const FINISHED_SIGNALS = [
  /season\s+(?:has\s+)?(?:ended|concluded|finished|completed|over)/i,
  /final\s+(?:standings?|table|day|match|matchday)/i,
  /(?:champion|title)\s+(?:won|confirmed|clinched|crowned)/i,
  /relegated?\s+(?:teams?|clubs?|sides?)/i,
  /promoted?\s+(?:teams?|clubs?)/i,
  /(?:full|all|complete)\s+(?:results?|scores?)\s+(?:for|of)\s+(?:the\s+)?202[0-9]/i,
  /all\s+\d+\s+(?:match|fixture)/i,
  /all-time\s+premier/i,
  /full[-\s]+(?:schedule|fixtures?|results?)\s+202[0-9]/i,
  /myfootballfacts/i
];

// Dates in the future relative to season = planning for new season = finished current
const NEXT_SEASON_SIGNALS = [
  /202[67][-\/]2[78]\s+(?:season|fixtures|schedule)/i,
  /next\s+season\s+(?:start|begin|kick)/i,
  /season\s+202[67][-\/]2[78]/i
];

function countMatches(text, patterns) {
  return patterns.filter(p => p.test(text)).length;
}

function extractResumeDate(text) {
  const patterns = [
    /resumes?\s+(?:on\s+)?([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4})/i,
    /restarts?\s+(?:on\s+)?([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4})/i,
    /returns?\s+(?:on\s+)?([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4})/i,
    /(\d{1,2}\s+[A-Za-z]+\s+\d{4})/,
    /([A-Za-z]+\s+\d{4})/
  ];
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m && m[1]) {
      const parsed = new Date(m[1]);
      if (!isNaN(parsed.getTime()) && parsed > new Date()) {
        return parsed.toISOString().slice(0, 10);
      }
    }
  }
  return null;
}

function classifySearchRows(rows) {
  // Build combined text from ALL available fields: title + snippet + url hostname
  const parts = [];
  for (const row of rows) {
    if (row.title)   parts.push(row.title);
    if (row.snippet) parts.push(row.snippet);
    if (row.url) {
      try {
        const host = new URL(row.url).hostname;
        parts.push(host);
        // Also add path segments as words
        const path = new URL(row.url).pathname;
        parts.push(path.replace(/[-_/]/g, " "));
      } catch {}
    }
  }

  const combined = parts.join(" ");

  const activeHits      = countMatches(combined, ACTIVE_SIGNALS);
  const pauseHits       = countMatches(combined, PAUSE_SIGNALS);
  const finishedHits    = countMatches(combined, FINISHED_SIGNALS);
  const nextSeasonHits  = countMatches(combined, NEXT_SEASON_SIGNALS);

  const totalFinished = finishedHits + nextSeasonHits;
  const total = activeHits + pauseHits + totalFinished;

  if (total === 0) {
    return { state: "unknown", confidence: 0, activeHits, pauseHits, finishedHits, nextSeasonHits };
  }

  // World Cup / break signals dominate
  if (pauseHits >= 1) {
    const resumeDate = extractResumeDate(combined);
    const conf = Math.min(0.90, 0.55 + pauseHits * 0.15);
    return { state: "pause", resumeDate, confidence: conf, activeHits, pauseHits, finishedHits, nextSeasonHits };
  }

  // Next season planning → current season finished
  if (nextSeasonHits >= 1 && activeHits === 0) {
    return { state: "finished", confidence: 0.72, activeHits, pauseHits, finishedHits, nextSeasonHits };
  }

  // Explicit finished signals
  if (totalFinished >= 2 && totalFinished > activeHits) {
    return { state: "finished", confidence: Math.min(0.90, 0.55 + totalFinished * 0.12), activeHits, pauseHits, finishedHits, nextSeasonHits };
  }

  if (totalFinished >= 1 && activeHits === 0) {
    return { state: "finished", confidence: 0.60, activeHits, pauseHits, finishedHits, nextSeasonHits };
  }

  // Active signals
  if (activeHits >= 2) {
    return { state: "active", confidence: Math.min(0.88, 0.55 + activeHits * 0.12), activeHits, pauseHits, finishedHits, nextSeasonHits };
  }

  if (activeHits === 1 && pauseHits === 0 && totalFinished === 0) {
    return { state: "active", confidence: 0.58, activeHits, pauseHits, finishedHits, nextSeasonHits };
  }

  return { state: "unknown", confidence: 0.25, activeHits, pauseHits, finishedHits, nextSeasonHits };
}

function buildQueries(leagueName, countryName, season = "2025-26") {
  return [
    `${leagueName} ${season} fixtures schedule`,
    `${leagueName} ${season} standings table`,
    `${countryName} football league ${season} status`
  ];
}

export async function checkLeaguePulse(slug, leagueName, countryName, options = {}) {
  const allowSearch = options.allowSearch === true;
  const season      = options.season || "2025-26";
  const queries     = buildQueries(leagueName, countryName, season);

  const allRows      = [];
  const searchResults = [];

  if (allowSearch) {
    for (const query of queries) {
      const result = await searchWeb(query, { allowSearch: true });
      searchResults.push({ query, ok: result.ok, rowCount: result.rows.length });
      allRows.push(...result.rows);
      if (allRows.length >= 20) break;
    }
  }

  const classification = classifySearchRows(allRows);
  const recheckAfter   = computeRecheckAfter(classification.state, classification.resumeDate || null);

  return {
    ok: true,
    slug,
    leagueName,
    countryName,
    state:       classification.state,
    confidence:  classification.confidence,
    resumeDate:  classification.resumeDate || null,
    recheckAfter,
    signals: {
      activeHits:     classification.activeHits,
      pauseHits:      classification.pauseHits,
      finishedHits:   classification.finishedHits,
      nextSeasonHits: classification.nextSeasonHits
    },
    rowCount:      allRows.length,
    searchResults,
    checkedAt:     new Date().toISOString(),
    allowSearch
  };
}
