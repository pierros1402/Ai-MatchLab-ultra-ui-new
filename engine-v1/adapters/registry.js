import { fetchLeagueFixtures } from "./espn.js";
import {
  fetchLeagueFixturesSource2,
  isSource2Enabled,
  isSource2TargetLeague
} from "./source2.js";

import { normalizeFixture } from "../core/normalize.js";
import { normalizeFixtureSource2 } from "../core/normalize-source2.js";

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
  "bra.1",
  "mex.1",
  "uru.1",
  "col.1",
  "chi.1",
  "per.1",

  "jpn.1",
  "ksa.1",
  "rsa.1"
]);

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
    id: "api_football",
    legacyId: "source2",
    label: "API-Football",
    kind: "fixtures",
    priority: 80,
    family: "secondary",
    isEnabled() {
      return isSource2Enabled();
    },
    supportsLeague(slug) {
      return isSource2TargetLeague(slug);
    },
    async fetch({ slug, dayKey }) {
      const data = await fetchLeagueFixturesSource2(slug, dayKey);
      return Array.isArray(data?.events) ? data.events : [];
    },
    normalize(event, slug) {
      return normalizeFixtureSource2(event, slug);
    }
  }
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