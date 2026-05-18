function normalizeText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function slugText(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function compactText(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function uniq(items) {
  const seen = new Set();
  const out = [];

  for (const item of items) {
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

function asDateKey(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : raw || null;
}

function deriveTeams(watchRow) {
  const homeTeam = watchRow?.homeTeam || watchRow?.home || watchRow?.homeName || null;
  const awayTeam = watchRow?.awayTeam || watchRow?.away || watchRow?.awayName || null;

  return {
    homeTeam: homeTeam ? String(homeTeam).trim() : null,
    awayTeam: awayTeam ? String(awayTeam).trim() : null,
    homeSlug: slugText(homeTeam),
    awaySlug: slugText(awayTeam),
    homeCompact: compactText(homeTeam),
    awayCompact: compactText(awayTeam)
  };
}

function buildSearchQueries(watchRow, teams) {
  const date = asDateKey(watchRow?.date || watchRow?.dayKey || watchRow?.utcDate);
  const league = watchRow?.leagueName || watchRow?.league || watchRow?.leagueSlug || "";

  const base = [
    teams.homeTeam,
    teams.awayTeam,
    date,
    league
  ].filter(Boolean).join(" ");

  const exactMatch = [
    `"${teams.homeTeam}" "${teams.awayTeam}" final score`,
    `"${teams.homeTeam}" "${teams.awayTeam}" full time`,
    `"${teams.homeTeam}" "${teams.awayTeam}" result`,
    base ? `${base} final score` : null,
    base ? `${base} full time result` : null
  ].filter(Boolean);

  const officialBiased = [
    `"${teams.homeTeam}" official "${teams.awayTeam}" result`,
    `"${teams.awayTeam}" official "${teams.homeTeam}" result`,
    `"${teams.homeTeam}" match report "${teams.awayTeam}"`,
    `"${teams.awayTeam}" match report "${teams.homeTeam}"`
  ].filter(Boolean);

  const providerBiased = [
    `${teams.homeTeam} ${teams.awayTeam} ESPN final score`,
    `${teams.homeTeam} ${teams.awayTeam} Soccerway result`,
    `${teams.homeTeam} ${teams.awayTeam} Flashscore result`,
    `${teams.homeTeam} ${teams.awayTeam} FotMob result`
  ].filter(Boolean);

  return uniq([
    ...exactMatch.map(query => ({
      type: "search_query",
      priority: 1,
      intent: "exact_match_final_result",
      query
    })),
    ...officialBiased.map(query => ({
      type: "search_query",
      priority: 2,
      intent: "official_or_match_report",
      query
    })),
    ...providerBiased.map(query => ({
      type: "search_query",
      priority: 3,
      intent: "provider_cross_check",
      query
    }))
  ]);
}

function buildSourceDescriptors(watchRow, teams) {
  const fixtureId = watchRow?.fixtureId || watchRow?.id || null;
  const leagueSlug = watchRow?.leagueSlug || null;

  const descriptors = [
    {
      type: "official_candidate",
      priority: 1,
      sourceType: "official",
      sourceKey: "home_official_site_candidate",
      teamSide: "home",
      teamName: teams.homeTeam,
      expectedSignals: ["final score", "full time", "match report"],
      notes: "Descriptor only. No fetch is performed by source discovery."
    },
    {
      type: "official_candidate",
      priority: 1,
      sourceType: "official",
      sourceKey: "away_official_site_candidate",
      teamSide: "away",
      teamName: teams.awayTeam,
      expectedSignals: ["final score", "full time", "match report"],
      notes: "Descriptor only. No fetch is performed by source discovery."
    },
    {
      type: "provider_candidate",
      priority: 2,
      sourceType: "provider",
      sourceKey: "provider_scoreboard_candidate",
      fixtureId,
      leagueSlug,
      expectedSignals: ["status final", "home score", "away score"],
      notes: "Descriptor only. No provider authority is granted here."
    },
    {
      type: "trusted_aggregator_candidate",
      priority: 3,
      sourceType: "trusted",
      sourceKey: "trusted_result_page_candidate",
      fixtureId,
      leagueSlug,
      expectedSignals: ["full time", "final result", "date/team match"],
      notes: "Descriptor only. Must still pass evidence validation and verification."
    }
  ];

  return descriptors.filter(row => {
    if (row.teamSide === "home" && !teams.homeTeam) return false;
    if (row.teamSide === "away" && !teams.awayTeam) return false;
    return true;
  });
}

export function discoverFinalResultSources(watchRow, options = {}) {
  const teams = deriveTeams(watchRow);

  const missing = [];
  if (!teams.homeTeam) missing.push("home_team");
  if (!teams.awayTeam) missing.push("away_team");

  if (missing.length) {
    return {
      ok: false,
      mode: "read_only_source_discovery",
      canonicalWrites: 0,
      verdict: "insufficient_watch_row",
      reason: "missing_required_team_fields",
      missing,
      watchRow: watchRow || null,
      sourceDescriptors: [],
      searchDescriptors: []
    };
  }

  const sourceDescriptors = buildSourceDescriptors(watchRow, teams);
  const searchDescriptors = buildSearchQueries(watchRow, teams);

  const maxSearchDescriptors = Number.isInteger(options.maxSearchDescriptors)
    ? Math.max(0, options.maxSearchDescriptors)
    : searchDescriptors.length;

  return {
    ok: true,
    mode: "read_only_source_discovery",
    canonicalWrites: 0,
    verdict: "source_discovery_descriptors_ready",
    watchRow: watchRow || null,
    normalized: {
      date: asDateKey(watchRow?.date || watchRow?.dayKey || watchRow?.utcDate),
      fixtureId: watchRow?.fixtureId || watchRow?.id || null,
      leagueSlug: watchRow?.leagueSlug || null,
      homeTeam: teams.homeTeam,
      awayTeam: teams.awayTeam,
      homeSlug: teams.homeSlug,
      awaySlug: teams.awaySlug
    },
    sourceDescriptors,
    searchDescriptors: searchDescriptors.slice(0, maxSearchDescriptors),
    counts: {
      sourceDescriptors: sourceDescriptors.length,
      searchDescriptors: Math.min(searchDescriptors.length, maxSearchDescriptors),
      totalSearchDescriptorsAvailable: searchDescriptors.length
    },
    guarantees: {
      noFetch: true,
      noFinalTruthDecision: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0
    }
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runSelfTest() {
  const watchRow = {
    fixtureId: "fixture-1",
    date: "2026-05-18",
    leagueSlug: "test.1",
    leagueName: "Test League",
    homeTeam: "Home FC",
    awayTeam: "Away FC"
  };

  const report = discoverFinalResultSources(watchRow, {
    maxSearchDescriptors: 5
  });

  assert(report.ok === true, "source discovery should be ok");
  assert(report.canonicalWrites === 0, "source discovery must not write canonical data");
  assert(report.guarantees.noFetch === true, "source discovery must not fetch");
  assert(report.guarantees.noFinalTruthDecision === true, "source discovery must not decide final truth");
  assert(report.sourceDescriptors.length >= 3, "expected source descriptors");
  assert(report.searchDescriptors.length === 5, "expected capped search descriptors");
  assert(report.normalized.homeSlug === "home-fc", "home slug mismatch");
  assert(report.normalized.awaySlug === "away-fc", "away slug mismatch");

  const missing = discoverFinalResultSources({ homeTeam: "Only Home" });
  assert(missing.ok === false, "missing away team should fail");
  assert(missing.verdict === "insufficient_watch_row", "missing verdict mismatch");
  assert(missing.canonicalWrites === 0, "missing case must not write canonical data");

  console.log(JSON.stringify({
    ok: true,
    selfTest: "source-discovery",
    canonicalWrites: report.canonicalWrites,
    sourceDescriptors: report.counts.sourceDescriptors,
    searchDescriptors: report.counts.searchDescriptors,
    guarantees: report.guarantees,
    missingVerdict: missing.verdict
  }, null, 2));
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
}
