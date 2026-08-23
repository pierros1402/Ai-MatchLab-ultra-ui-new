import crypto from "node:crypto";

import {
  canonicalFixturesForDay
} from "./day-fixture-universe.js";

export const VALUE_FIXTURE_UNIVERSE_SCHEMA =
  "ai-matchlab.value-fixture-universe.v1";

function clean(value) {
  return String(value || "")
    .trim();
}

function canonicalIdOf(row) {
  return clean(row?.canonicalId);
}

function descriptorOf(row) {
  return {
    canonicalId:
      canonicalIdOf(row),

    leagueSlug:
      clean(row?.leagueSlug),

    homeTeam:
      clean(
        row?.homeTeam ||
        row?.home
      ),

    awayTeam:
      clean(
        row?.awayTeam ||
        row?.away
      ),

    kickoffUtc:
      clean(row?.kickoffUtc)
  };
}

export function buildValueFixtureUniverse(
  dayKey,
  options = {}
) {
  const canonicalFixtures =
    Array.isArray(options.fixtures)
      ? [...options.fixtures]
      : canonicalFixturesForDay(dayKey);

  const missingCanonicalIdentity =
    canonicalFixtures.filter(
      row =>
        !canonicalIdOf(row)
    );

  if (
    missingCanonicalIdentity.length > 0
  ) {
    throw new Error(
      "VALUE_FIXTURE_UNIVERSE_MISSING_CANONICAL_ID"
    );
  }

  canonicalFixtures.sort(
    (a, b) =>
      canonicalIdOf(a)
        .localeCompare(
          canonicalIdOf(b)
        )
  );

  const canonicalIds =
    canonicalFixtures.map(
      canonicalIdOf
    );

  const duplicateCanonicalIds =
    canonicalIds.filter(
      (id, index) =>
        canonicalIds.indexOf(id) !==
        index
    );

  if (
    duplicateCanonicalIds.length > 0
  ) {
    throw new Error(
      "VALUE_FIXTURE_UNIVERSE_DUPLICATE_CANONICAL_IDS:" +
      [
        ...new Set(
          duplicateCanonicalIds
        )
      ].join(",")
    );
  }

  const descriptors =
    canonicalFixtures.map(
      descriptorOf
    );

  const hash =
    crypto
      .createHash("sha256")
      .update(
        JSON.stringify(
          descriptors
        ),
        "utf8"
      )
      .digest("hex");

  return {
    schema:
      VALUE_FIXTURE_UNIVERSE_SCHEMA,

    dayKey,

    source:
      "canonical_fixtures",

    count:
      canonicalFixtures.length,

    hash,

    canonicalIds,

    fixtures:
      canonicalFixtures
  };
}

export function valueFixtureUniverseContract(
  universe
) {
  return {
    schema:
      universe?.schema ||
      VALUE_FIXTURE_UNIVERSE_SCHEMA,

    source:
      universe?.source ||
      "canonical_fixtures",

    count:
      Number(
        universe?.count || 0
      ),

    hash:
      clean(universe?.hash),

    canonicalIds:
      Array.isArray(
        universe?.canonicalIds
      )
        ? [...universe.canonicalIds]
        : []
  };
}

export function assertValueFixtureUniverseParity(
  planAUniverse,
  planBUniverse
) {
  const planA =
    valueFixtureUniverseContract(
      planAUniverse
    );

  const planB =
    valueFixtureUniverseContract(
      planBUniverse
    );

  const sameCanonicalIds =
    JSON.stringify(
      planA.canonicalIds
    ) ===
    JSON.stringify(
      planB.canonicalIds
    );

  if (
    planA.count !== planB.count ||
    planA.hash !== planB.hash ||
    !sameCanonicalIds
  ) {
    const error =
      new Error(
        "VALUE_PLAN_UNIVERSE_PARITY_FAILED"
      );

    error.details = {
      planA,
      planB
    };

    throw error;
  }

  return {
    ok: true,

    count:
      planA.count,

    hash:
      planA.hash,

    canonicalIds:
      planA.canonicalIds
  };
}
export function assertValueFixtureUniverseMembershipParity(
  leftUniverse,
  rightUniverse
) {
  const left =
    valueFixtureUniverseContract(
      leftUniverse
    );

  const right =
    valueFixtureUniverseContract(
      rightUniverse
    );

  const sameCanonicalIds =
    JSON.stringify(
      left.canonicalIds
    ) ===
    JSON.stringify(
      right.canonicalIds
    );

  if (
    left.count !== right.count ||
    !sameCanonicalIds
  ) {
    const error =
      new Error(
        "VALUE_PLAN_UNIVERSE_MEMBERSHIP_PARITY_FAILED"
      );

    error.details = {
      left,
      right
    };

    throw error;
  }

  return {
    ok: true,
    count: left.count,
    canonicalIds: left.canonicalIds,
    leftHash: left.hash,
    rightHash: right.hash,
    descriptorHashEqual:
      left.hash === right.hash,
    descriptorDrift:
      left.hash !== right.hash
  };
}
