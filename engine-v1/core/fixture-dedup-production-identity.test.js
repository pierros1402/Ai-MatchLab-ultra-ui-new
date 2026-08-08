import test from "node:test";
import assert from "node:assert/strict";

import {
  dedupeLeagueDayFixtures,
  sameTeamName
} from "./fixture-dedup.js";
import {
  getProductionIdentityResolver
} from "./production-identity-resolver-runtime.js";

const identityResolver = getProductionIdentityResolver();

const CASES = [
  {
    slug: "bol.1",
    left: ["Academia del Balompie", "Guabira"],
    right: ["ABB", "Guabirá"]
  },
  {
    slug: "bol.1",
    left: ["SA Bulo Bulo", "Nacional Potosi"],
    right: ["San Antonio Bulo Bulo", "Nacional Potosí"]
  },
  {
    slug: "rus.1",
    left: ["Krylya Sovetov", "Baltika"],
    right: ["Krylia Sovetov", "FC Baltika Kaliningrad"]
  },
  {
    slug: "rus.1",
    left: ["Lokomotiv Moscow", "Akron Togliatti"],
    right: ["Lokomotiv Moscow", "Akron Tolyatti"]
  },
  {
    slug: "ned.1",
    left: ["G.A. Eagles", "Willem II"],
    right: ["Go Ahead Eagles", "Willem II"]
  },
  {
    slug: "bel.1",
    left: ["St. Truiden", "Lommel SK"],
    right: ["Sint-Truidense", "Lommel SK"]
  },
  {
    slug: "bel.1",
    left: ["Westerlo", "Royale Union SG"],
    right: ["KVC Westerlo", "Union St.-Gilloise"]
  },
  {
    slug: "fra.2",
    left: ["Sochaux", "St Etienne"],
    right: ["Sochaux", "Saint-Étienne"]
  },
  {
    slug: "per.1",
    left: ["Cajamarca", "AD Tarma"],
    right: ["UTC", "ADT"]
  }
];

function row({ slug, names, source, index }) {
  return {
    canonicalId: `cid_${slug.replace(".", "")}_${source}_${index}_20260808`,
    matchId: `${source}-${index}`,
    source,
    sourceId: `${source}-${index}`,
    sourceMatchId: `${source}-${index}`,
    leagueSlug: slug,
    dayKey: "2026-08-08",
    kickoffUtc: "2026-08-08T18:00:00.000Z",
    homeTeam: names[0],
    awayTeam: names[1]
  };
}

test("all 2026-08-08 confirmed semantic duplicate pairs collapse", () => {
  for (const [index, item] of CASES.entries()) {
    const result = dedupeLeagueDayFixtures(
      [
        row({ slug: item.slug, names: item.left, source: "flashscore", index }),
        row({ slug: item.slug, names: item.right, source: "espn", index })
      ],
      { slug: item.slug, identityResolver }
    );

    assert.equal(
      result.rows.length,
      1,
      `${item.slug}: ${item.left.join(" v ")} must collapse with ${item.right.join(" v ")}`
    );
    assert.equal(result.removed.length, 1);
    assert.deepEqual(
      result.rows[0].providerIds,
      {
        flashscore: `flashscore-${index}`,
        espn: `espn-${index}`
      }
    );
    assert.deepEqual(
      result.rows[0].canonicalAliases,
      [`cid_${item.slug.replace(".", "")}_flashscore_${index}_20260808`]
    );
  }
});

test("finalized production identity reuses a globalClubId on a new fixture date", () => {
  assert.equal(
    sameTeamName(
      "per.1",
      "Cajamarca",
      "UTC",
      { identityResolver }
    ),
    true
  );
});

test("different finalized globalClubIds veto heuristic name merging", () => {
  assert.equal(
    sameTeamName(
      "bol.1",
      "Academia del Balompie",
      "San Antonio Bulo Bulo",
      { identityResolver }
    ),
    false
  );
});

test("production identity matching still preserves squad separation", () => {
  assert.equal(
    sameTeamName(
      "per.1",
      "UTC",
      "UTC U20",
      { identityResolver }
    ),
    false
  );
});
