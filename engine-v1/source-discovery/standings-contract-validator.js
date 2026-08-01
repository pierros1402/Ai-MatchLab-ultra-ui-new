import {
  buildCompetitionFormatRegistryIndex,
  resolveCompetitionFormatContract,
  validateCompetitionFormatRegistry
} from "../core/competition-format-registry.js";

function clean(value) {
  return String(value ?? "").trim();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeName(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function issue(code, severity, scope, message, details = null) {
  return {
    code,
    severity,
    scope,
    message,
    ...(details == null ? {} : { details })
  };
}

function teamName(row) {
  return clean(row?.teamName || row?.team || row?.name);
}

function canonicalTeamId(row) {
  const candidates = [
    row?.globalClubId,
    row?.canonicalTeamId,
    row?.canonicalTeamID,
    row?.teamCanonicalId
  ];
  for (const value of candidates) {
    const id = clean(value);
    if (id) return id;
  }
  return null;
}

function rowIdentity(row) {
  const canonicalId = canonicalTeamId(row);
  if (canonicalId) {
    return {
      key: `id:${canonicalId}`,
      canonicalId,
      normalizedName: normalizeName(teamName(row)),
      source: "CANONICAL_ID"
    };
  }

  const normalized = normalizeName(teamName(row));
  if (normalized) {
    return {
      key: `name:${normalized}`,
      canonicalId: null,
      normalizedName: normalized,
      source: "NORMALIZED_NAME_FALLBACK"
    };
  }

  return {
    key: null,
    canonicalId: null,
    normalizedName: "",
    source: "MISSING"
  };
}

function rowPosition(row) {
  const value = Number(row?.position ?? row?.rank);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function extractStandingsTables(standings) {
  if (Array.isArray(standings)) {
    return {
      league: null,
      primaryRows: standings,
      phaseTables: {},
      artifactShape: "ARRAY"
    };
  }

  const payload = isPlainObject(standings) ? standings : {};
  const primaryRows = safeArray(payload.table);
  const phaseSource = isPlainObject(payload.phaseTables)
    ? payload.phaseTables
    : isPlainObject(payload.phases)
      ? payload.phases
      : {};

  const phaseTables = Object.fromEntries(
    Object.entries(phaseSource).map(([key, rows]) => [clean(key).toLowerCase(), safeArray(rows)])
  );

  return {
    league: clean(payload.league || payload.leagueSlug || payload.competitionSlug) || null,
    primaryRows,
    phaseTables,
    artifactShape: "OBJECT"
  };
}

function evaluateCountRule(observed, rule, scope, issues, options = {}) {
  if (!rule || rule.mode === "UNVERIFIED") {
    return {
      evaluated: false,
      pass: null,
      expected: null,
      observed
    };
  }

  if (rule.mode === "EXACT") {
    const expected = rule.value;
    const pass = observed === expected;
    if (!pass) {
      issues.push(issue(
        observed > expected ? "TEAM_COUNT_ABOVE_CONTRACT" : "TEAM_COUNT_BELOW_CONTRACT",
        options.severity || "error",
        scope,
        `Observed unique team count ${observed} does not equal contract count ${expected}.`,
        { observed, expected, delta: observed - expected }
      ));
    }
    return { evaluated: true, pass, expected: { mode: "EXACT", value: expected }, observed };
  }

  const minimum = rule.minimum;
  const maximum = rule.maximum;
  const pass = observed >= minimum && observed <= maximum;
  if (!pass) {
    issues.push(issue(
      observed > maximum ? "TEAM_COUNT_ABOVE_CONTRACT" : "TEAM_COUNT_BELOW_CONTRACT",
      options.severity || "error",
      scope,
      `Observed unique team count ${observed} is outside contract range ${minimum}-${maximum}.`,
      { observed, minimum, maximum }
    ));
  }
  return { evaluated: true, pass, expected: { mode: "RANGE", minimum, maximum }, observed };
}

function inspectTable(rows, scope, issues, options = {}) {
  const safeRows = safeArray(rows);
  const identities = safeRows.map((row, index) => ({ index, row, identity: rowIdentity(row) }));
  const missingIdentityRows = identities.filter(item => !item.identity.key);
  const fallbackRows = identities.filter(item => item.identity.source === "NORMALIZED_NAME_FALLBACK");

  if (safeRows.length === 0 && options.allowEmpty !== true) {
    issues.push(issue("TABLE_EMPTY", "error", scope, "Standings table is empty."));
  }

  if (missingIdentityRows.length > 0) {
    issues.push(issue(
      "TEAM_IDENTITY_MISSING",
      "error",
      scope,
      `${missingIdentityRows.length} standings rows have neither canonical team ID nor usable team name.`,
      { rowIndexes: missingIdentityRows.slice(0, 20).map(item => item.index) }
    ));
  }

  if (fallbackRows.length > 0) {
    issues.push(issue(
      "CANONICAL_TEAM_ID_MISSING",
      "warning",
      scope,
      `${fallbackRows.length} rows use normalized team-name fallback because canonical team IDs are absent.`,
      { count: fallbackRows.length }
    ));
  }

  const identityGroups = new Map();
  for (const item of identities) {
    if (!item.identity.key) continue;
    if (!identityGroups.has(item.identity.key)) identityGroups.set(item.identity.key, []);
    identityGroups.get(item.identity.key).push(item);
  }

  const duplicateIdentities = [...identityGroups.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([key, items]) => ({
      key,
      rows: items.map(item => item.index),
      names: [...new Set(items.map(item => teamName(item.row)).filter(Boolean))]
    }));

  if (duplicateIdentities.length > 0) {
    issues.push(issue(
      "DUPLICATE_TEAM_IDENTITY",
      "error",
      scope,
      `${duplicateIdentities.length} team identities occur more than once in the same table.`,
      { duplicates: duplicateIdentities.slice(0, 20) }
    ));
  }

  const positions = new Map();
  safeRows.forEach((row, index) => {
    const position = rowPosition(row);
    if (position == null) return;
    if (!positions.has(position)) positions.set(position, []);
    positions.get(position).push(index);
  });
  const duplicatePositions = [...positions.entries()]
    .filter(([, indexes]) => indexes.length > 1)
    .map(([position, indexes]) => ({ position, rows: indexes }));

  if (duplicatePositions.length > 0) {
    issues.push(issue(
      "DUPLICATE_POSITION",
      "error",
      scope,
      `${duplicatePositions.length} positions occur more than once in the same table.`,
      { duplicates: duplicatePositions.slice(0, 20) }
    ));
  }

  const missingPositions = safeRows
    .map((row, index) => ({ index, position: rowPosition(row) }))
    .filter(item => item.position == null);
  if (missingPositions.length > 0) {
    issues.push(issue(
      "POSITION_MISSING_OR_INVALID",
      "warning",
      scope,
      `${missingPositions.length} rows have no valid positive integer position.`,
      { rowIndexes: missingPositions.slice(0, 20).map(item => item.index) }
    ));
  }

  const identitySet = new Set([...identityGroups.keys()]);
  return {
    rowCount: safeRows.length,
    uniqueTeamCount: identitySet.size,
    identitySet,
    canonicalIdCount: identities.filter(item => item.identity.source === "CANONICAL_ID").length,
    fallbackIdentityCount: fallbackRows.length,
    missingIdentityCount: missingIdentityRows.length,
    duplicateIdentityCount: duplicateIdentities.length,
    duplicatePositionCount: duplicatePositions.length
  };
}

function selectPrimaryUniverse(contract, inspectedPrimary, inspectedPhases, issues) {
  const source = contract.tableModel.primaryTableSource;
  if (source === "TABLE") {
    return {
      source: "TABLE",
      inspection: inspectedPrimary
    };
  }

  if (source === "PHASE_UNION") {
    const union = new Set();
    for (const inspection of inspectedPhases.values()) {
      for (const key of inspection.identitySet) union.add(key);
    }
    return {
      source: "PHASE_UNION",
      inspection: {
        rowCount: [...inspectedPhases.values()].reduce((sum, item) => sum + item.rowCount, 0),
        uniqueTeamCount: union.size,
        identitySet: union,
        canonicalIdCount: [...inspectedPhases.values()].reduce((sum, item) => sum + item.canonicalIdCount, 0),
        fallbackIdentityCount: [...inspectedPhases.values()].reduce((sum, item) => sum + item.fallbackIdentityCount, 0),
        missingIdentityCount: [...inspectedPhases.values()].reduce((sum, item) => sum + item.missingIdentityCount, 0),
        duplicateIdentityCount: 0,
        duplicatePositionCount: 0
      }
    };
  }

  issues.push(issue(
    "PRIMARY_UNIVERSE_NOT_DEFINED",
    "warning",
    "contract.tableModel",
    "Contract does not define whether the participant universe comes from table or phase union."
  ));
  return {
    source: "UNKNOWN",
    inspection: inspectedPrimary.rowCount > 0 ? inspectedPrimary : {
      rowCount: 0,
      uniqueTeamCount: 0,
      identitySet: new Set(),
      canonicalIdCount: 0,
      fallbackIdentityCount: 0,
      missingIdentityCount: 0,
      duplicateIdentityCount: 0,
      duplicatePositionCount: 0
    }
  };
}

function validatePhaseModel(contract, extracted, inspectedPrimary, issues) {
  const declaredPhases = new Map(
    safeArray(contract.tableModel.phases).map(phase => [clean(phase.key).toLowerCase(), phase])
  );
  const observedKeys = Object.keys(extracted.phaseTables);
  const inspectedPhases = new Map();

  for (const key of observedKeys) {
    inspectedPhases.set(key, inspectTable(extracted.phaseTables[key], `phase:${key}`, issues));
  }

  for (const [key, phase] of declaredPhases.entries()) {
    const observed = inspectedPhases.get(key);
    if (phase.required && !observed) {
      const severity = phase.authority === "VERIFIED" ? "error" : "warning";
      issues.push(issue(
        "REQUIRED_PHASE_MISSING",
        severity,
        `phase:${key}`,
        `Required phase ${key} is absent.`,
        { authority: phase.authority }
      ));
      continue;
    }
    if (!observed) continue;

    if (phase.authority === "VERIFIED" && phase.teamCount) {
      evaluateCountRule(observed.uniqueTeamCount, phase.teamCount, `phase:${key}`, issues);
    }

    if (
      phase.participantScope === "SUBSET" &&
      inspectedPrimary.identitySet.size > 0 &&
      observed.identitySet.size > 0
    ) {
      const outside = [...observed.identitySet].filter(identity => !inspectedPrimary.identitySet.has(identity));
      if (outside.length > 0) {
        issues.push(issue(
          "PHASE_TEAM_OUTSIDE_PRIMARY_UNIVERSE",
          phase.authority === "VERIFIED" ? "error" : "warning",
          `phase:${key}`,
          `${outside.length} phase team identities are absent from the primary competition table.`,
          { identities: outside.slice(0, 20) }
        ));
      }
    }
  }

  if (!contract.tableModel.allowUnknownPhaseKeys) {
    for (const key of observedKeys) {
      if (!declaredPhases.has(key)) {
        issues.push(issue(
          "UNKNOWN_PHASE_KEY",
          contract.authority.scopes.includes("PHASE_STRUCTURE") ? "error" : "warning",
          `phase:${key}`,
          `Observed phase key ${key} is not declared by the contract.`
        ));
      }
    }
  }

  for (const group of safeArray(contract.tableModel.partitionGroups)) {
    const groupInspections = safeArray(group.phaseKeys)
      .map(key => ({ key, inspection: inspectedPhases.get(key) }))
      .filter(item => item.inspection);

    if (groupInspections.length !== safeArray(group.phaseKeys).length) continue;

    const union = new Set();
    const seen = new Map();
    for (const { key, inspection } of groupInspections) {
      for (const identity of inspection.identitySet) {
        union.add(identity);
        if (!seen.has(identity)) seen.set(identity, []);
        seen.get(identity).push(key);
      }
    }

    if (group.requireDisjoint) {
      const overlaps = [...seen.entries()]
        .filter(([, keys]) => keys.length > 1)
        .map(([identity, keys]) => ({ identity, phaseKeys: keys }));
      if (overlaps.length > 0) {
        issues.push(issue(
          "PHASE_PARTITION_OVERLAP",
          "error",
          `partition:${group.id}`,
          `${overlaps.length} team identities occur in multiple phases of a disjoint partition.`,
          { overlaps: overlaps.slice(0, 20) }
        ));
      }
    }

    if (group.expectedUnionTeamCount) {
      evaluateCountRule(union.size, group.expectedUnionTeamCount, `partition:${group.id}`, issues);
    }

    if (group.coversPrimaryUniverse && inspectedPrimary.identitySet.size > 0) {
      const missingFromPartition = [...inspectedPrimary.identitySet].filter(identity => !union.has(identity));
      const outsidePrimary = [...union].filter(identity => !inspectedPrimary.identitySet.has(identity));
      if (missingFromPartition.length > 0 || outsidePrimary.length > 0) {
        issues.push(issue(
          "PHASE_PARTITION_UNIVERSE_MISMATCH",
          "error",
          `partition:${group.id}`,
          "Phase partition does not exactly cover the primary competition universe.",
          {
            missingFromPartition: missingFromPartition.slice(0, 20),
            outsidePrimary: outsidePrimary.slice(0, 20)
          }
        ));
      }
    }
  }

  return inspectedPhases;
}

export function validateStandingsContract(input = {}) {
  const {
    registry,
    registryIndex = null,
    leagueSlug,
    seasonReference = null,
    standings
  } = input;

  const issues = [];
  const mutationGuard = {
    readOnly: true,
    mutationAttempted: false,
    mutations: []
  };

  const registryValidation = registryIndex
    ? registryIndex.validation || { ok: true, issues: [] }
    : validateCompetitionFormatRegistry(registry);

  if (!registryValidation.ok) {
    return {
      schema: "ai-matchlab.standings-contract-validation.v1",
      status: "INVALID_REGISTRY",
      ok: false,
      publicationDecision: "NOT_APPLIED_READ_ONLY",
      leagueSlug: clean(leagueSlug) || null,
      seasonReference: clean(seasonReference) || null,
      contractId: null,
      authority: null,
      summary: null,
      issues: [
        issue(
          "REGISTRY_INVALID",
          "error",
          "registry",
          "Competition format registry failed validation.",
          { registryIssues: registryValidation.issues }
        )
      ],
      mutationGuard
    };
  }

  const index = registryIndex || buildCompetitionFormatRegistryIndex(registry, { skipValidation: true });
  const slug = clean(leagueSlug);
  const contract = resolveCompetitionFormatContract(index, slug, seasonReference);

  if (!contract) {
    return {
      schema: "ai-matchlab.standings-contract-validation.v1",
      status: "NO_CONTRACT",
      ok: false,
      publicationDecision: "NOT_APPLIED_READ_ONLY",
      leagueSlug: slug || null,
      seasonReference: clean(seasonReference) || null,
      contractId: null,
      authority: null,
      summary: null,
      issues: [issue("CONTRACT_NOT_FOUND", "error", "contract", "No competition-format contract matches this league and season.")],
      mutationGuard
    };
  }

  if (contract.competition.enabled === false) {
    return {
      schema: "ai-matchlab.standings-contract-validation.v1",
      status: "NOT_APPLICABLE",
      ok: true,
      publicationDecision: "NOT_APPLIED_READ_ONLY",
      leagueSlug: slug,
      seasonReference: contract.season.reference,
      contractId: contract.contractId,
      authority: contract.authority,
      summary: null,
      issues: [issue("COMPETITION_DISABLED", "info", "contract", "Competition is disabled; standings compliance is not evaluated.")],
      mutationGuard
    };
  }

  const extracted = extractStandingsTables(standings);
  if (extracted.league && extracted.league !== slug) {
    issues.push(issue(
      "ARTIFACT_LEAGUE_MISMATCH",
      "error",
      "artifact",
      `Standings artifact league ${extracted.league} does not match requested league ${slug}.`,
      { artifactLeague: extracted.league, requestedLeague: slug }
    ));
  }

  const inspectedPrimary = inspectTable(
    extracted.primaryRows,
    "primary",
    issues,
    { allowEmpty: contract.tableModel.primaryTableSource === "PHASE_UNION" }
  );
  const inspectedPhases = validatePhaseModel(contract, extracted, inspectedPrimary, issues);
  const primaryUniverse = selectPrimaryUniverse(contract, inspectedPrimary, inspectedPhases, issues);

  const hasTeamCountAuthority = contract.authority.scopes.includes("TEAM_COUNT");
  let teamCountEvaluation = {
    evaluated: false,
    pass: null,
    expected: null,
    observed: primaryUniverse.inspection.uniqueTeamCount
  };

  const canonicalIdentityComplete =
    primaryUniverse.inspection.fallbackIdentityCount === 0 &&
    primaryUniverse.inspection.missingIdentityCount === 0;

  if (hasTeamCountAuthority) {
    teamCountEvaluation = evaluateCountRule(
      primaryUniverse.inspection.uniqueTeamCount,
      contract.teamCount.rule,
      "primary-universe",
      issues
    );
    if (!canonicalIdentityComplete) {
      issues.push(issue(
        "CANONICAL_TEAM_ID_REQUIRED_FOR_TEAM_COUNT_AUTHORITY",
        "error",
        "primary-universe",
        "Authoritative team-count compliance requires canonical team identities for every participant; normalized names or provider-local IDs cannot establish a PASS.",
        {
          canonicalIdRows: primaryUniverse.inspection.canonicalIdCount,
          fallbackIdentityRows: primaryUniverse.inspection.fallbackIdentityCount,
          missingIdentityRows: primaryUniverse.inspection.missingIdentityCount
        }
      ));
    }
  } else {
    issues.push(issue(
      "TEAM_COUNT_CONTRACT_UNVERIFIED",
      "warning",
      "contract.teamCount",
      "Team count is not authoritative for this league/season; count mismatch is not evaluated as compliance failure."
    ));
  }

  const errorCount = issues.filter(item => item.severity === "error").length;
  const warningCount = issues.filter(item => item.severity === "warning").length;
  const hasAnyAuthority = contract.authority.scopes.length > 0;
  const status = errorCount > 0
    ? "FAIL"
    : hasAnyAuthority
      ? "PASS"
      : "UNVERIFIED";

  return {
    schema: "ai-matchlab.standings-contract-validation.v1",
    status,
    ok: status === "PASS",
    publicationDecision: "NOT_APPLIED_READ_ONLY",
    leagueSlug: slug,
    seasonReference: contract.season.reference,
    contractId: contract.contractId,
    authority: {
      status: contract.authority.status,
      scopes: contract.authority.scopes,
      verifiedAt: contract.authority.verifiedAt
    },
    artifact: {
      shape: extracted.artifactShape,
      declaredLeague: extracted.league,
      observedPhaseKeys: Object.keys(extracted.phaseTables)
    },
    summary: {
      primaryUniverseSource: primaryUniverse.source,
      primaryRowCount: inspectedPrimary.rowCount,
      primaryUniqueTeamCount: inspectedPrimary.uniqueTeamCount,
      primaryCanonicalIdCount: inspectedPrimary.canonicalIdCount,
      primaryFallbackIdentityCount: inspectedPrimary.fallbackIdentityCount,
      primaryCanonicalIdentityComplete: canonicalIdentityComplete,
      phaseTableCount: inspectedPhases.size,
      teamCountEvaluation,
      errorCount,
      warningCount
    },
    issues,
    mutationGuard
  };
}

export function validateStandingsContractsBatch(input = {}) {
  const { registry, artifacts = [], seasonReference = null } = input;
  const validation = validateCompetitionFormatRegistry(registry);
  if (!validation.ok) {
    return {
      schema: "ai-matchlab.standings-contract-batch.v1",
      status: "INVALID_REGISTRY",
      ok: false,
      publicationDecision: "NOT_APPLIED_READ_ONLY",
      registryValidation: validation,
      summary: {
        artifacts: safeArray(artifacts).length,
        pass: 0,
        fail: 0,
        unverified: 0,
        noContract: 0,
        notApplicable: 0
      },
      results: []
    };
  }

  const index = buildCompetitionFormatRegistryIndex(registry, { skipValidation: true });
  const results = safeArray(artifacts).map(item => validateStandingsContract({
    registry,
    registryIndex: index,
    leagueSlug: item?.leagueSlug,
    seasonReference: item?.seasonReference || seasonReference,
    standings: item?.standings
  }));

  const summary = {
    artifacts: results.length,
    pass: results.filter(result => result.status === "PASS").length,
    fail: results.filter(result => result.status === "FAIL").length,
    unverified: results.filter(result => result.status === "UNVERIFIED").length,
    noContract: results.filter(result => result.status === "NO_CONTRACT").length,
    notApplicable: results.filter(result => result.status === "NOT_APPLICABLE").length
  };

  const hardFailureFree = summary.fail === 0 && summary.noContract === 0;
  const authorityComplete = summary.unverified === 0;

  return {
    schema: "ai-matchlab.standings-contract-batch.v1",
    status: !hardFailureFree
      ? "ISSUES_FOUND"
      : authorityComplete
        ? "COMPLETE"
        : "COMPLETE_WITH_UNVERIFIED",
    ok: hardFailureFree,
    authorityComplete,
    publicationDecision: "NOT_APPLIED_READ_ONLY",
    registryVersion: registry.registryVersion,
    registryValidation: validation,
    summary,
    results
  };
}
