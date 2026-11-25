import fs from "node:fs";

import { resolveDataPath } from "./data-root.js";
import { globalCanonicalTeamName } from "./team-aliases-db.js";
import { LEAGUES_COVERAGE } from "../../workers/_shared/leagues-coverage.js";

const RESULTS_DIR =
  resolveDataPath("league-memory", "results");

function clean(value) {
  return String(value ?? "").trim();
}

function zeroRates(reason, details = {}) {
  return {
    sample: 0,
    gfRate: null,
    gaRate: null,
    ppg: null,
    source: "cross_competition_form",
    ok: false,
    reason,
    ...details
  };
}

/**
 * Deliberately stricter than normalizeTeamKey().
 *
 * It preserves:
 * - accents
 * - punctuation
 * - FC / SC / AFC etc.
 *
 * Explicit global alias canonicalization is accepted only when the existing
 * collision-safe alias layer actually resolves the spelling.
 */
export function strictCrossCompetitionTeamKey(
  teamName,
  canonicalResolver = globalCanonicalTeamName
) {
  const raw = clean(teamName);

  if (!raw) {
    return null;
  }

  const explicitCanonical =
    typeof canonicalResolver === "function"
      ? canonicalResolver(raw)
      : null;

  const basis =
    clean(explicitCanonical) || raw;

  return basis
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function coverageMap(rows) {
  return new Map(
    (rows || [])
      .filter(row => row?.slug)
      .map(row => [row.slug, row])
  );
}

export function isCrossCompetitionFormFixtureScopeSupported(
  fixtureSlug,
  rows = LEAGUES_COVERAGE
) {
  const meta =
    coverageMap(rows).get(fixtureSlug);

  return Boolean(
    meta &&
    (
      meta.type === "league" ||
      meta.type === "cup" ||
      meta.type === "continental"
    )
  );
}

// All explicit signals must agree. A conflicting nested binding is not
// silently hidden by a top-level ID.
function perspectiveGlobalClubIds(row) {
  const side = row?.ha === "H" ? "home" : row?.ha === "A" ? "away" : null;
  if (!side) return [];
  return [...new Set([
    row?.[side+"GlobalClubId"],
    row?.productionIdentityBinding?.[side+"GlobalClubId"]
  ].map(clean).filter(Boolean))];
}

function readResultDocuments() {
  const docs = [];

  let files = [];

  try {
    files =
      fs.readdirSync(RESULTS_DIR)
        .filter(file => file.endsWith(".json"))
        .sort();
  }
  catch {
    return docs;
  }

  for (const file of files) {
    const slug =
      file.replace(/\.json$/i, "");

    try {
      const doc =
        JSON.parse(
          fs.readFileSync(
            resolveDataPath(
              "league-memory",
              "results",
              file
            ),
            "utf8"
          )
        );

      docs.push({
        slug,
        doc
      });
    }
    catch {
      // Fail closed for this source document.
    }
  }

  return docs;
}

function computeRates(rows, window) {
  const list =
    rows.slice(0, window);

  if (!list.length) {
    return {
      sample: 0,
      gfRate: null,
      gaRate: null,
      ppg: null
    };
  }

  let gf = 0;
  let ga = 0;
  let points = 0;

  for (const item of list) {
    const row = item.row;

    gf += Number(row?.gf) || 0;
    ga += Number(row?.ga) || 0;

    points +=
      row?.res === "W"
        ? 3
        : row?.res === "D"
          ? 1
          : 0;
  }

  return {
    sample: list.length,
    gfRate: gf / list.length,
    gaRate: ga / list.length,
    ppg: points / list.length
  };
}

/**
 * Build one immutable read-only resolver snapshot.
 *
 * This intentionally does NOT mutate result memory and does NOT allocate
 * globalClubIds. It provides model evidence only.
 */
export function createCrossCompetitionFormResolver({
  coverageRows = LEAGUES_COVERAGE,
  resultDocuments = null,
  canonicalResolver = globalCanonicalTeamName
} = {}) {

  const coverage =
    coverageMap(coverageRows);

  const documents =
    Array.isArray(resultDocuments)
      ? resultDocuments
      : readResultDocuments();

  const byIdentity =
    new Map();

  for (const item of documents) {
    const slug =
      clean(item?.slug);

    const meta =
      coverage.get(slug);

    /*
     * Only declared domestic LEAGUES may contribute historical form.
     * Cups, continental competitions and provider shadow slugs cannot
     * become source evidence.
     */
    if (
      !meta ||
      meta.type !== "league" ||
      !meta.country
    ) {
      continue;
    }

    for (
      const [teamName, rows]
      of Object.entries(
        item?.doc?.teams || {}
      )
    ) {
      if (!Array.isArray(rows)) {
        continue;
      }

      const identityKey =
        strictCrossCompetitionTeamKey(
          teamName,
          canonicalResolver
        );

      if (!identityKey) {
        continue;
      }

      if (!byIdentity.has(identityKey)) {
        byIdentity.set(
          identityKey,
          []
        );
      }

      byIdentity.get(identityKey).push({
        slug,
        country: meta.country,
        region: meta.region,
        teamName,
        rows
      });
    }
  }

  return function resolveCrossCompetitionForm(
    fixtureSlug,
    teamName,
    window = 6,
    {
      beforeMs = null,
      expectedGlobalClubId = null
    } = {}
  ) {

    const fixtureMeta =
      coverage.get(fixtureSlug);

    if (
      !fixtureMeta ||
      ![
        "league",
        "cup",
        "continental"
      ].includes(fixtureMeta.type)
    ) {
      return zeroRates(
        "fixture_scope_not_supported"
      );
    }

    const identityKey =
      strictCrossCompetitionTeamKey(
        teamName,
        canonicalResolver
      );

    if (!identityKey) {
      return zeroRates(
        "team_identity_missing"
      );
    }

    // Identity evidence must obey the same as-of boundary as form rates.
    const allCandidates =
      (byIdentity.get(identityKey) || []).map(source => ({
        ...source,
        rows: source.rows.filter(row => {
          if (!Number.isFinite(beforeMs)) return true;
          const ms = Date.parse(String(row?.date || ""));
          return Number.isFinite(ms) && ms < beforeMs;
        })
      })).filter(source => source.rows.length);

    if (!allCandidates.length) {
      return zeroRates(
        "no_cross_competition_source",
        { identityKey }
      );
    }

    const expected = clean(expectedGlobalClubId);
    let selected =
      allCandidates;

    if (
      fixtureMeta.type === "league" ||
      fixtureMeta.type === "cup"
    ) {
      selected =
        allCandidates.filter(
          item =>
            item.country === fixtureMeta.country
        );

      if (!selected.length) {
        return zeroRates(
          "no_same_country_source",
          {
            identityKey,
            fixtureCountry:
              fixtureMeta.country
          }
        );
      }
    }
    else {
      // Regional coverage is an exclusion boundary, not proof of club identity.
      // Apply only to declared regional club competitions; FIFA/world and
      // national-team competitions retain the existing ambiguity policy.
      const regionalClubCompetitions = new Set([
        "uefa.champions", "ucl.q", "uefa.europa", "uel.q",
        "uefa.europa.conf", "uecl.q", "uefa.super_cup",
        "afc.champions", "afc.cup", "caf.champions", "caf.confed"
      ]);
      if (regionalClubCompetitions.has(fixtureSlug) && fixtureMeta.region) {
        // Unknown regional metadata cannot safely break an identity tie.
        if (allCandidates.every(item => Boolean(item.region))) {
          selected = allCandidates.filter(item => item.region === fixtureMeta.region);
          if (!selected.length) {
            return zeroRates("no_same_region_source", { identityKey, fixtureRegion: fixtureMeta.region });
          }
        }
      }
      // An explicit fixture-side ID may resolve a same-region homonym,
      // but only when the candidate source contains that exact ID and
      // contains no contradictory ID. Unbound sources cannot win.
      if (expected) {
        const bound = selected.filter(source => {
          const ids = new Set(source.rows.flatMap(perspectiveGlobalClubIds));
          return ids.size === 1 && ids.has(expected);
        });
        if (!bound.length) return zeroRates("expected_global_club_id_unverified", { identityKey });
        selected = bound;
      }
      const countries =
        [
          ...new Set(
            selected
              .map(item => item.country)
              .filter(Boolean)
          )
        ].sort();

      if (countries.length !== 1) {
        return zeroRates(
          "cross_country_identity_ambiguous",
          {
            identityKey,
            sourceCountries: countries
          }
        );
      }

      selected =
        selected.filter(
          item =>
            item.country === countries[0]
        );
    }

    const explicitGlobalIds =
      new Set();

    for (const source of selected) {
      for (const row of source.rows) {
        for (const globalClubId of perspectiveGlobalClubIds(row)) {
          explicitGlobalIds.add(globalClubId);
        }
      }
    }

    /*
     * Existing finalized global IDs are a VETO signal.
     * We do not allocate IDs here and we never merge two explicit IDs.
     */
    if (explicitGlobalIds.size > 1) {
      return zeroRates(
        "global_club_id_conflict",
        {
          identityKey,
          globalClubIds:
            [...explicitGlobalIds].sort()
        }
      );
    }

    if (expected && (explicitGlobalIds.size !== 1 || !explicitGlobalIds.has(expected))) {
      return zeroRates("expected_global_club_id_unverified", { identityKey });
    }

    const byMatch =
      new Map();

    for (const source of selected) {
      for (const row of source.rows) {

        // Explicit binding requires row-level evidence; a single known ID
        // does not certify all historical rows in a display-name bucket.
        if (expected && !perspectiveGlobalClubIds(row).includes(expected)) continue;
        const rowMs =
          Date.parse(
            String(row?.date || "")
          );

        if (
          Number.isFinite(beforeMs) &&
          (
            !Number.isFinite(rowMs) ||
            rowMs >= beforeMs
          )
        ) {
          continue;
        }

        const matchKey =
          clean(
            row?.canonicalId ||
            row?.matchId ||
            row?.sourceFixtureId
          ) ||
          [
            clean(row?.date),
            clean(row?.opp),
            clean(row?.ha),
            Number(row?.gf) || 0,
            Number(row?.ga) || 0
          ].join("|");

        const candidate = {
          row,
          rowMs:
            Number.isFinite(rowMs)
              ? rowMs
              : 0,
          slug: source.slug,
          country: source.country,
          sourceTeamName:
            source.teamName
        };

        const prior =
          byMatch.get(matchKey);

        if (
          !prior ||
          candidate.rowMs >
            prior.rowMs
        ) {
          byMatch.set(
            matchKey,
            candidate
          );
        }
      }
    }

    const rows =
      [...byMatch.values()]
        .sort(
          (a, b) =>
            b.rowMs - a.rowMs
        );

    const safeWindow =
      Number.isInteger(window) &&
      window > 0
        ? window
        : 6;

    const rates =
      computeRates(
        rows,
        safeWindow
      );

    if (!rates.sample) {
      return zeroRates(
        "no_eligible_prior_results",
        { identityKey }
      );
    }

    const sourceCountries =
      [
        ...new Set(
          selected
            .map(item => item.country)
            .filter(Boolean)
        )
      ].sort();

    const sourceSlugs =
      [
        ...new Set(
          rows
            .slice(0, safeWindow)
            .map(item => item.slug)
            .filter(Boolean)
        )
      ].sort();

    return {
      ...rates,
      ok: true,
      source:
        "cross_competition_form",
      reason:
        expected ? "explicit_global_id_bound_cross_competition_form" : "safe_country_bound_cross_competition_form",
      identityKey,
      identityMode:
        globalCanonicalTeamName(teamName)
          ? "explicit_alias_canonical"
          : "strict_display",
      sourceCountry:
        sourceCountries.length === 1
          ? sourceCountries[0]
          : null,
      sourceSlugs,
      globalClubId:
        explicitGlobalIds.size === 1
          ? [...explicitGlobalIds][0]
          : null
    };
  };
}