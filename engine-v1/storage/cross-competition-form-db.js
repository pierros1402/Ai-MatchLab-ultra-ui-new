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

function perspectiveGlobalClubId(row) {
  const binding =
    row?.productionIdentityBinding || {};

  if (row?.ha === "H") {
    return clean(
      row?.homeGlobalClubId ||
      binding?.homeGlobalClubId
    ) || null;
  }

  if (row?.ha === "A") {
    return clean(
      row?.awayGlobalClubId ||
      binding?.awayGlobalClubId
    ) || null;
  }

  return null;
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
      beforeMs = null
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

    const allCandidates =
      byIdentity.get(identityKey) || [];

    if (!allCandidates.length) {
      return zeroRates(
        "no_cross_competition_source",
        { identityKey }
      );
    }

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
      const countries =
        [
          ...new Set(
            allCandidates
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
        allCandidates.filter(
          item =>
            item.country === countries[0]
        );
    }

    const explicitGlobalIds =
      new Set();

    for (const source of selected) {
      for (const row of source.rows) {
        const globalClubId =
          perspectiveGlobalClubId(row);

        if (globalClubId) {
          explicitGlobalIds.add(
            globalClubId
          );
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

    const byMatch =
      new Map();

    for (const source of selected) {
      for (const row of source.rows) {

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
        "safe_country_bound_cross_competition_form",
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