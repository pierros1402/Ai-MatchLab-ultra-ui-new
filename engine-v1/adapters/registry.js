import { fetchLeagueFixtures } from "./espn.js";
import { normalizeFixture } from "../core/normalize.js";
import { fetchFlashscoreFixtures } from "../odds/flashscore-fixtures-source.js";
import { resolveInternational } from "../odds/international-competitions.js";
import { buildCanonicalId } from "../core/canonical-id.js";
import { athensDayFromKickoff } from "../core/daykey.js";
import { LEAGUES_COVERAGE } from "../../workers/_shared/leagues-coverage.js";
import {
  flashscoreOffsetsForRequestedDay,
  flashscoreRowMatchesRequestedAthensDay,
  resolveFlashscoreAcquisitionIdentity
} from "./flashscore-acquisition-contract.js";

const ESPN_SUPPORTED = new Set([
  "eng.1",
  "eng.2",
  "eng.3",
  "eng.4",
  "eng.5",
  "eng.fa",
  "eng.league_cup",
  "eng.trophy",

  "ger.1",
  "ger.2",
  "ger.dfb_pokal",

  "esp.1",
  "esp.2",
  "esp.copa_del_rey",
  "esp.super_cup",

  "ita.1",
  "ita.2",
  "ita.coppa_italia",

  "fra.1",
  "fra.2",
  "fra.coupe_de_france",
  "fra.super_cup",

  "ned.1",
  "ned.2",
  "ned.cup",

  "por.1",
  "bel.1",

  "sco.1",
  "sco.2",
  "sco.challenge",
  "sco.tennents",

  "gre.1",
  "cyp.1",
  "tur.1",
  "sui.1",
  "aut.1",
  "den.1",
  "swe.1",
  "nor.1",

  "uefa.champions",
  "uefa.europa",
  "uefa.europa.conf",

  "afc.champions",
  "afc.cup",
  "caf.champions",
  "caf.confed",
  "caf.nations",
  "conmebol.libertadores",

  "usa.1",
  "arg.1",
  "arg.2",
  "bra.1",
  "bra.2",
  "mex.1",
  "mex.2",
  "uru.1",
  "col.1",
  "chi.1",
  "per.1",

  "jpn.1",
  "ksa.1",
  "rsa.1",

  // Summer-active European leagues (Nordic). irl.2 / den.2 / fin.2 get 400 from ESPN.
  "swe.2",
  "nor.2",
  "fin.1",
  "irl.1",

  // FIFA World competitions — ESPN uses slug "fifa.world" (verified from supplemental)
  "fifa.world"
]);

// Flashscore covers EVERY declared league: primary provider for leagues ESPN
// does not support, and fallback for ESPN leagues when ESPN returns zero
// events or errors (ESPN-supported leagues must not be single-provider risk).
const FLASHSCORE_SUPPORTED = new Set(
  LEAGUES_COVERAGE
    .map(s => String(s?.slug || "").trim())
    .filter(Boolean)
);

// Flashscore exposes offset-based day feeds, not a calendar-date query. Cache
// each requested Athens day only after fetching the offsets that actually cover
// that day. Rows are hard-filtered to the exact Athens kickoff day below.
const _fsCache = new Map(); // dayKey → { rows, fetchedAt, offsets }

async function getFlashscoreRows(dayKey) {
  if (_fsCache.has(dayKey)) return _fsCache.get(dayKey);

  const offsets = flashscoreOffsetsForRequestedDay(dayKey);
  const feed = await fetchFlashscoreFixtures({ offsets });
  const result = {
    rows: feed.rows || [],
    fetchedAt: Date.now(),
    offsets
  };

  _fsCache.set(dayKey, result);
  return result;
}

const FIXTURE_ADAPTERS = [
  {
    id: "espn",
    label: "ESPN",
    kind: "fixtures",
    priority: 100,
    family: "primary",
    isEnabled() {
      return true;
    },
    supportsLeague(slug) {
      return ESPN_SUPPORTED.has(slug);
    },
    async fetch({ slug, dayKey }) {
      const data = await fetchLeagueFixtures(slug, dayKey);
      return Array.isArray(data?.events) ? data.events : [];
    },
    normalize(event, slug) {
      return normalizeFixture(event, slug);
    }
  },

  {
    id: "flashscore",
    label: "Flashscore",
    kind: "fixtures",
    // Lower priority than ESPN — ESPN is preferred where both cover a league.
    // For leagues only Flashscore covers this is the sole provider (mode: "single").
    priority: 60,
    family: "secondary",
    isEnabled() {
      return true;
    },
    supportsLeague(slug) {
      return FLASHSCORE_SUPPORTED.has(slug);
    },
    // Admission is fail-closed: a row must belong to the exact requested Athens
    // day and its provider competition must resolve through an admitted exact
    // path (or the explicit international classifier). Fuzzy domestic name
    // matching is intentionally forbidden in canonical fixture acquisition.
    async fetch({ slug, dayKey }) {
      const { rows } = await getFlashscoreRows(dayKey);

      return rows.filter(fx => {
        if (!flashscoreRowMatchesRequestedAthensDay(fx, dayKey)) {
          return false;
        }

        const identity = resolveFlashscoreAcquisitionIdentity(fx);
        return identity.ok && identity.slug === slug;
      });
    },
    // Converts an admitted Flashscore row to the canonical fixture shape.
    normalize(fx, slug) {
      if (!fx?.kickoffUtc || !fx?.home || !fx?.away) return null;

      const identity = resolveFlashscoreAcquisitionIdentity(fx);
      if (!identity.ok || identity.slug !== slug) return null;

      const leagueSlug = identity.slug;
      const intl = identity.identityMode === "explicit_international_classifier"
        ? resolveInternational(fx.leagueName, fx.country)
        : null;

      // Identity and bucketing use the Athens calendar day of the kickoff,
      // exactly like the ESPN path. The raw Flashscore feed day is not trusted
      // as canonical calendar identity.
      const canonicalId = buildCanonicalId(leagueSlug, fx.home, fx.away, fx.kickoffUtc);
      if (!canonicalId) return null;

      return {
        canonicalId,
        // matchId = canonicalId for Flashscore-sourced matches (no ESPN numeric ID)
        matchId: canonicalId,
        matchKey: `${canonicalId}`,
        source: "flashscore",
        sourceId: String(fx.matchId),
        sourceMatchId: String(fx.matchId),

        leagueSlug,
        leagueName: intl ? intl.label : fx.leagueName,
        providerLeagueSlug: leagueSlug,
        providerLeaguePath: identity.providerPath,
        providerTournamentId: fx.tournamentId || null,
        providerStageId: fx.stageId || null,
        providerCompetitionIdentity: identity.identityMode,

        dayKey: athensDayFromKickoff(fx.kickoffUtc),
        kickoffUtc: fx.kickoffUtc,

        homeTeam: fx.home,
        awayTeam: fx.away,

        scoreHome: null,
        scoreAway: null,
        penalties: null,
        decidedBy: null,

        rawStatus: "STATUS_SCHEDULED",
        status: "STATUS_SCHEDULED",
        minute: null,

        venue: null,

        state: "staging",
        finalized: 0,
        updatedAt: Date.now()
      };
    }
  },
];

export function getFixtureAdapters() {
  return [...FIXTURE_ADAPTERS].sort((a, b) => {
    const pa = Number(a?.priority || 0);
    const pb = Number(b?.priority || 0);
    return pb - pa;
  });
}

export function getFixtureAdapterById(id) {
  const key = String(id || "").trim();
  if (!key) return null;

  return (
    FIXTURE_ADAPTERS.find(adapter => adapter.id === key || adapter.legacyId === key) || null
  );
}

export function getFixtureProviderPlan(slug) {
  const supported = getFixtureAdapters().filter(adapter => {
    try {
      return adapter.isEnabled() && adapter.supportsLeague(slug);
    } catch {
      return false;
    }
  });

  const primary = supported[0] || null;
  const fallbacks = supported.slice(1);

  const mode =
    supported.length > 1 ? "multi" : supported.length === 1 ? "single" : "none";

  let execution = "skip";

  if (mode === "single") {
    execution = "primary_only";
  } else if (mode === "multi") {
    execution = "primary_then_conditional_fallback";
  }

  return {
    leagueSlug: slug,
    mode,
    execution,
    fallbackPolicy: {
      enabled: mode === "multi",
      strategy: "on_primary_failure_or_empty",
      triggerOnPrimaryError: true,
      triggerOnPrimaryEmpty: true
    },
    providers: supported.map(adapter => ({
      id: adapter.id,
      label: adapter.label || adapter.id,
      priority: Number(adapter.priority || 0),
      family: adapter.family || "unknown",
      enabled: true
    })),
    primary: primary
      ? {
          id: primary.id,
          label: primary.label || primary.id,
          priority: Number(primary.priority || 0),
          family: primary.family || "unknown"
        }
      : null,
    fallbacks: fallbacks.map(adapter => ({
      id: adapter.id,
      label: adapter.label || adapter.id,
      priority: Number(adapter.priority || 0),
      family: adapter.family || "unknown"
    }))
  };
}
