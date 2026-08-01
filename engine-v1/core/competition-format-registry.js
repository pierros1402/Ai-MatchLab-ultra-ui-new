const REGISTRY_SCHEMA = "ai-matchlab.competition-format-registry.v1";
const REGISTRY_STATUSES = new Set([
  "PARTIAL_AUTHORITY_READ_ONLY",
  "PRODUCTION_AUTHORITY_READ_ONLY",
  "RETIRED"
]);
const AUTHORITY_STATUSES = new Set([
  "PARTIALLY_VERIFIED",
  "VERIFIED",
  "UNVERIFIED",
  "NO_BASELINE"
]);
const AUTHORITY_SCOPES = new Set([
  "TEAM_COUNT",
  "PHASE_STRUCTURE",
  "PROMOTION_RELEGATION",
  "CONTINENTAL_QUALIFICATION",
  "TIE_BREAK_RULES",
  "SEASON_CALENDAR"
]);
const SEASON_MODELS = new Set(["CALENDAR_YEAR", "CROSS_YEAR", "UNKNOWN"]);
const TABLE_FORMATS = new Set(["SINGLE_TABLE", "PHASE_SPLIT", "UNKNOWN"]);
const PRIMARY_TABLE_SOURCES = new Set(["TABLE", "PHASE_UNION", "UNKNOWN"]);
const PHASE_SCOPES = new Set(["FULL_COMPETITION", "SUBSET", "INDEPENDENT_GROUP"]);
const PHASE_AUTHORITIES = new Set(["VERIFIED", "OBSERVED_ONLY", "UNVERIFIED"]);
const COUNT_MODES = new Set(["EXACT", "RANGE", "UNVERIFIED"]);
const TEAM_COUNT_ENFORCEMENT = new Set([
  "STRICT_REPORT_ONLY",
  "REPORT_ONLY",
  "NOT_EVALUATED"
]);
const EVIDENCE_SOURCE_CLASSES = new Set([
  "PRIMARY_OFFICIAL",
  "PRIMARY_REGULATION",
  "TRUSTED_SECONDARY",
  "AGGREGATOR",
  "ENCYCLOPEDIA"
]);
const PRIMARY_EVIDENCE_SOURCE_CLASSES = new Set([
  "PRIMARY_OFFICIAL",
  "PRIMARY_REGULATION"
]);

function clean(value) {
  return String(value ?? "").trim();
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isIsoDateTime(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime());
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function issue(code, path, message, severity = "error", details = null) {
  return {
    code,
    path,
    severity,
    message,
    ...(details == null ? {} : { details })
  };
}

function validateAllowedKeys(value, allowedKeys, path, issues, code = "UNKNOWN_FIELD") {
  if (!isPlainObject(value)) return;
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      issues.push(issue(code, `${path}.${key}`, `Field ${key} is not allowed by the registry contract.`));
    }
  }
}

function validateCountRule(rule, path, issues) {
  if (!isPlainObject(rule)) {
    issues.push(issue("COUNT_RULE_INVALID", path, "Count rule must be an object."));
    return;
  }
  validateAllowedKeys(rule, ["mode", "value", "minimum", "maximum"], path, issues, "COUNT_RULE_UNKNOWN_FIELD");

  if (!COUNT_MODES.has(rule.mode)) {
    issues.push(issue("COUNT_RULE_MODE_INVALID", `${path}.mode`, "Unsupported count-rule mode."));
    return;
  }

  const isCount = value => Number.isInteger(value) && value >= 2;

  if (rule.mode === "EXACT") {
    if (!isCount(rule.value)) {
      issues.push(issue("COUNT_RULE_EXACT_VALUE_INVALID", `${path}.value`, "EXACT count requires an integer value >= 2."));
    }
    if (rule.minimum != null || rule.maximum != null) {
      issues.push(issue("COUNT_RULE_EXACT_RANGE_FORBIDDEN", path, "EXACT count must not also declare minimum/maximum."));
    }
    return;
  }

  if (rule.mode === "RANGE") {
    if (!isCount(rule.minimum) || !isCount(rule.maximum)) {
      issues.push(issue("COUNT_RULE_RANGE_INVALID", path, "RANGE count requires integer minimum and maximum >= 2."));
    } else if (rule.minimum > rule.maximum) {
      issues.push(issue("COUNT_RULE_RANGE_REVERSED", path, "Count-rule minimum exceeds maximum."));
    }
    if (rule.value != null) {
      issues.push(issue("COUNT_RULE_RANGE_VALUE_FORBIDDEN", `${path}.value`, "RANGE count must not declare an exact value."));
    }
    return;
  }

  if (rule.value != null || rule.minimum != null || rule.maximum != null) {
    issues.push(issue("COUNT_RULE_UNVERIFIED_VALUES_FORBIDDEN", path, "UNVERIFIED count must keep value/minimum/maximum null."));
  }
}

function validateEvidence(evidence, path, issues) {
  if (!isPlainObject(evidence)) {
    issues.push(issue("EVIDENCE_INVALID", path, "Evidence item must be an object."));
    return;
  }
  validateAllowedKeys(
    evidence,
    ["sourceClass", "publisher", "title", "url", "retrievedAt", "supports"],
    path,
    issues,
    "EVIDENCE_UNKNOWN_FIELD"
  );

  if (!EVIDENCE_SOURCE_CLASSES.has(evidence.sourceClass)) {
    issues.push(issue("EVIDENCE_SOURCE_CLASS_INVALID", `${path}.sourceClass`, "Evidence sourceClass is invalid."));
  }
  if (!clean(evidence.publisher)) {
    issues.push(issue("EVIDENCE_PUBLISHER_MISSING", `${path}.publisher`, "Evidence publisher is required."));
  }
  if (!clean(evidence.title)) {
    issues.push(issue("EVIDENCE_TITLE_MISSING", `${path}.title`, "Evidence title is required."));
  }
  if (!isHttpUrl(evidence.url)) {
    issues.push(issue("EVIDENCE_URL_INVALID", `${path}.url`, "Evidence URL must be HTTP(S)."));
  }
  if (!isIsoDate(evidence.retrievedAt)) {
    issues.push(issue("EVIDENCE_DATE_INVALID", `${path}.retrievedAt`, "Evidence retrievedAt must be YYYY-MM-DD."));
  }
  if (!Array.isArray(evidence.supports) || evidence.supports.length === 0) {
    issues.push(issue("EVIDENCE_SUPPORTS_EMPTY", `${path}.supports`, "Evidence must identify at least one supported authority scope."));
  } else {
    for (let i = 0; i < evidence.supports.length; i += 1) {
      if (!AUTHORITY_SCOPES.has(evidence.supports[i])) {
        issues.push(issue("EVIDENCE_SCOPE_INVALID", `${path}.supports[${i}]`, "Evidence references an unsupported authority scope."));
      }
    }
  }
}

function validateContract(contract, index, issues, seenContractIds, seenKeys) {
  const path = `contracts[${index}]`;
  if (!isPlainObject(contract)) {
    issues.push(issue("CONTRACT_INVALID", path, "Contract must be an object."));
    return;
  }
  validateAllowedKeys(
    contract,
    ["contractId", "contractVersion", "competition", "season", "authority", "teamCount", "tableModel", "rules", "provenance"],
    path,
    issues,
    "CONTRACT_UNKNOWN_FIELD"
  );

  const contractId = clean(contract.contractId);
  if (!/^[a-z0-9]+\.[0-9]+@\d{4}(?:-\d{4})?#v[1-9][0-9]*$/.test(contractId)) {
    issues.push(issue("CONTRACT_ID_INVALID", `${path}.contractId`, "Contract ID must be <slug>@<season>#v<version>."));
  } else if (seenContractIds.has(contractId)) {
    issues.push(issue("CONTRACT_ID_DUPLICATE", `${path}.contractId`, "Contract ID is duplicated."));
  } else {
    seenContractIds.add(contractId);
  }

  if (!Number.isInteger(contract.contractVersion) || contract.contractVersion < 1) {
    issues.push(issue("CONTRACT_VERSION_INVALID", `${path}.contractVersion`, "Contract version must be an integer >= 1."));
  }

  const competition = contract.competition;
  if (!isPlainObject(competition)) {
    issues.push(issue("COMPETITION_INVALID", `${path}.competition`, "Competition descriptor must be an object."));
    return;
  }
  validateAllowedKeys(
    competition,
    ["slug", "name", "country", "region", "kind", "enabled", "coverageTier"],
    `${path}.competition`,
    issues,
    "COMPETITION_UNKNOWN_FIELD"
  );

  const slug = clean(competition.slug);
  if (!/^[a-z0-9]+\.[0-9]+$/.test(slug)) {
    issues.push(issue("COMPETITION_SLUG_INVALID", `${path}.competition.slug`, "Competition slug is invalid."));
  }
  if (!clean(competition.name)) issues.push(issue("COMPETITION_NAME_MISSING", `${path}.competition.name`, "Competition name is required."));
  if (!clean(competition.country)) issues.push(issue("COMPETITION_COUNTRY_MISSING", `${path}.competition.country`, "Competition country is required."));
  if (!clean(competition.region)) issues.push(issue("COMPETITION_REGION_MISSING", `${path}.competition.region`, "Competition region is required."));
  if (competition.kind !== "DOMESTIC_LEAGUE") {
    issues.push(issue("COMPETITION_KIND_INVALID", `${path}.competition.kind`, "Only DOMESTIC_LEAGUE contracts belong in this registry."));
  }
  if (typeof competition.enabled !== "boolean") {
    issues.push(issue("COMPETITION_ENABLED_INVALID", `${path}.competition.enabled`, "Competition enabled must be boolean."));
  }
  if (competition.coverageTier != null && (!Number.isInteger(competition.coverageTier) || competition.coverageTier < 1)) {
    issues.push(issue("COMPETITION_TIER_INVALID", `${path}.competition.coverageTier`, "Coverage tier must be null or an integer >= 1."));
  }

  const season = contract.season;
  if (!isPlainObject(season)) {
    issues.push(issue("SEASON_INVALID", `${path}.season`, "Season descriptor must be an object."));
    return;
  }
  validateAllowedKeys(season, ["reference", "model", "validFrom", "validTo"], `${path}.season`, issues, "SEASON_UNKNOWN_FIELD");
  const seasonReference = clean(season.reference);
  if (!/^\d{4}(?:-\d{4})?$/.test(seasonReference)) {
    issues.push(issue("SEASON_REFERENCE_INVALID", `${path}.season.reference`, "Season reference must be YYYY or YYYY-YYYY."));
  }
  if (!SEASON_MODELS.has(season.model)) {
    issues.push(issue("SEASON_MODEL_INVALID", `${path}.season.model`, "Season model is invalid."));
  }
  for (const field of ["validFrom", "validTo"]) {
    if (season[field] != null && !isIsoDate(season[field])) {
      issues.push(issue("SEASON_DATE_INVALID", `${path}.season.${field}`, `${field} must be null or YYYY-MM-DD.`));
    }
  }
  if (isIsoDate(season.validFrom) && isIsoDate(season.validTo) && season.validFrom > season.validTo) {
    issues.push(issue("SEASON_DATE_RANGE_REVERSED", `${path}.season`, "Season validFrom exceeds validTo."));
  }

  const uniqueKey = `${slug}@${seasonReference}#v${contract.contractVersion}`;
  if (seenKeys.has(uniqueKey)) {
    issues.push(issue("CONTRACT_KEY_DUPLICATE", path, "Competition/season/version contract key is duplicated."));
  } else {
    seenKeys.add(uniqueKey);
  }
  if (contractId && uniqueKey !== contractId) {
    issues.push(issue("CONTRACT_ID_COMPONENT_MISMATCH", `${path}.contractId`, "Contract ID does not match competition slug, season reference and version."));
  }

  const authority = contract.authority;
  if (!isPlainObject(authority)) {
    issues.push(issue("AUTHORITY_INVALID", `${path}.authority`, "Authority descriptor must be an object."));
    return;
  }
  validateAllowedKeys(authority, ["status", "scopes", "verifiedAt", "evidence"], `${path}.authority`, issues, "AUTHORITY_UNKNOWN_FIELD");
  if (!AUTHORITY_STATUSES.has(authority.status)) {
    issues.push(issue("AUTHORITY_STATUS_INVALID", `${path}.authority.status`, "Authority status is invalid."));
  }
  if (!Array.isArray(authority.scopes)) {
    issues.push(issue("AUTHORITY_SCOPES_INVALID", `${path}.authority.scopes`, "Authority scopes must be an array."));
  } else {
    const seenScopes = new Set();
    authority.scopes.forEach((scope, scopeIndex) => {
      if (!AUTHORITY_SCOPES.has(scope)) {
        issues.push(issue("AUTHORITY_SCOPE_INVALID", `${path}.authority.scopes[${scopeIndex}]`, "Authority scope is invalid."));
      }
      if (seenScopes.has(scope)) {
        issues.push(issue("AUTHORITY_SCOPE_DUPLICATE", `${path}.authority.scopes[${scopeIndex}]`, "Authority scope is duplicated."));
      }
      seenScopes.add(scope);
    });
  }
  if (authority.verifiedAt != null && !isIsoDate(authority.verifiedAt)) {
    issues.push(issue("AUTHORITY_DATE_INVALID", `${path}.authority.verifiedAt`, "verifiedAt must be null or YYYY-MM-DD."));
  }
  if (!Array.isArray(authority.evidence)) {
    issues.push(issue("AUTHORITY_EVIDENCE_INVALID", `${path}.authority.evidence`, "Authority evidence must be an array."));
  } else {
    authority.evidence.forEach((item, evidenceIndex) => validateEvidence(item, `${path}.authority.evidence[${evidenceIndex}]`, issues));
  }

  const scopes = new Set(Array.isArray(authority.scopes) ? authority.scopes : []);
  const verifiedStatus = authority.status === "VERIFIED" || authority.status === "PARTIALLY_VERIFIED";
  if (verifiedStatus && scopes.size === 0) {
    issues.push(issue("VERIFIED_AUTHORITY_WITHOUT_SCOPE", `${path}.authority.scopes`, "Verified authority must identify at least one scope."));
  }
  if (scopes.size > 0 && !verifiedStatus) {
    issues.push(issue("UNVERIFIED_AUTHORITY_WITH_SCOPE", `${path}.authority`, "UNVERIFIED/NO_BASELINE contracts cannot carry authority scopes."));
  }
  if (verifiedStatus && !isIsoDate(authority.verifiedAt)) {
    issues.push(issue("VERIFIED_AUTHORITY_DATE_REQUIRED", `${path}.authority.verifiedAt`, "Verified authority requires a verification date."));
  }
  if (verifiedStatus && (!Array.isArray(authority.evidence) || authority.evidence.length === 0)) {
    issues.push(issue("VERIFIED_AUTHORITY_EVIDENCE_REQUIRED", `${path}.authority.evidence`, "Verified authority requires evidence."));
  }

  const teamCount = contract.teamCount;
  if (!isPlainObject(teamCount)) {
    issues.push(issue("TEAM_COUNT_INVALID", `${path}.teamCount`, "Team-count descriptor must be an object."));
  } else {
    validateAllowedKeys(teamCount, ["rule", "enforcement", "sourceLabel"], `${path}.teamCount`, issues, "TEAM_COUNT_UNKNOWN_FIELD");
    validateCountRule(teamCount.rule, `${path}.teamCount.rule`, issues);
    if (!TEAM_COUNT_ENFORCEMENT.has(teamCount.enforcement)) {
      issues.push(issue("TEAM_COUNT_ENFORCEMENT_INVALID", `${path}.teamCount.enforcement`, "Team-count enforcement is invalid."));
    }

    if (scopes.has("TEAM_COUNT")) {
      if (!isPlainObject(teamCount.rule) || teamCount.rule.mode === "UNVERIFIED") {
        issues.push(issue("TEAM_COUNT_AUTHORITY_WITHOUT_RULE", `${path}.teamCount.rule`, "TEAM_COUNT authority requires an exact or ranged rule."));
      }
      if (teamCount.enforcement !== "STRICT_REPORT_ONLY") {
        issues.push(issue("TEAM_COUNT_AUTHORITY_NOT_STRICT_REPORT_ONLY", `${path}.teamCount.enforcement`, "Authoritative team count must use STRICT_REPORT_ONLY in P0-B."));
      }
      const supportingEvidence = Array.isArray(authority.evidence)
        ? authority.evidence.filter(item =>
            Array.isArray(item?.supports) && item.supports.includes("TEAM_COUNT")
          )
        : [];
      if (supportingEvidence.length === 0) {
        issues.push(issue("TEAM_COUNT_EVIDENCE_MISSING", `${path}.authority.evidence`, "TEAM_COUNT authority requires supporting evidence."));
      } else if (!supportingEvidence.some(item => PRIMARY_EVIDENCE_SOURCE_CLASSES.has(item?.sourceClass))) {
        issues.push(issue(
          "TEAM_COUNT_PRIMARY_EVIDENCE_REQUIRED",
          `${path}.authority.evidence`,
          "TEAM_COUNT authority requires at least one PRIMARY_OFFICIAL or PRIMARY_REGULATION evidence item."
        ));
      }
    } else if (teamCount.enforcement === "STRICT_REPORT_ONLY") {
      issues.push(issue("TEAM_COUNT_STRICT_WITHOUT_AUTHORITY", `${path}.teamCount.enforcement`, "Strict count reporting is forbidden without TEAM_COUNT authority."));
    }
  }

  const tableModel = contract.tableModel;
  if (!isPlainObject(tableModel)) {
    issues.push(issue("TABLE_MODEL_INVALID", `${path}.tableModel`, "Table model must be an object."));
  } else {
    validateAllowedKeys(
      tableModel,
      ["format", "primaryTableSource", "allowUnknownPhaseKeys", "phases", "partitionGroups"],
      `${path}.tableModel`,
      issues,
      "TABLE_MODEL_UNKNOWN_FIELD"
    );
    if (!TABLE_FORMATS.has(tableModel.format)) {
      issues.push(issue("TABLE_FORMAT_INVALID", `${path}.tableModel.format`, "Table format is invalid."));
    }
    if (!PRIMARY_TABLE_SOURCES.has(tableModel.primaryTableSource)) {
      issues.push(issue("PRIMARY_TABLE_SOURCE_INVALID", `${path}.tableModel.primaryTableSource`, "Primary table source is invalid."));
    }
    if (typeof tableModel.allowUnknownPhaseKeys !== "boolean") {
      issues.push(issue("UNKNOWN_PHASE_POLICY_INVALID", `${path}.tableModel.allowUnknownPhaseKeys`, "allowUnknownPhaseKeys must be boolean."));
    }

    const phaseKeys = new Set();
    if (!Array.isArray(tableModel.phases)) {
      issues.push(issue("PHASES_INVALID", `${path}.tableModel.phases`, "Phases must be an array."));
    } else {
      tableModel.phases.forEach((phase, phaseIndex) => {
        const phasePath = `${path}.tableModel.phases[${phaseIndex}]`;
        if (!isPlainObject(phase)) {
          issues.push(issue("PHASE_INVALID", phasePath, "Phase must be an object."));
          return;
        }
        validateAllowedKeys(phase, ["key", "required", "participantScope", "teamCount", "authority"], phasePath, issues, "PHASE_UNKNOWN_FIELD");
        const key = clean(phase.key);
        if (!/^[a-z0-9][a-z0-9._-]*$/.test(key)) {
          issues.push(issue("PHASE_KEY_INVALID", `${phasePath}.key`, "Phase key is invalid."));
        } else if (phaseKeys.has(key)) {
          issues.push(issue("PHASE_KEY_DUPLICATE", `${phasePath}.key`, "Phase key is duplicated."));
        } else {
          phaseKeys.add(key);
        }
        if (typeof phase.required !== "boolean") {
          issues.push(issue("PHASE_REQUIRED_INVALID", `${phasePath}.required`, "Phase required flag must be boolean."));
        }
        if (!PHASE_SCOPES.has(phase.participantScope)) {
          issues.push(issue("PHASE_PARTICIPANT_SCOPE_INVALID", `${phasePath}.participantScope`, "Phase participant scope is invalid."));
        }
        if (!PHASE_AUTHORITIES.has(phase.authority)) {
          issues.push(issue("PHASE_AUTHORITY_INVALID", `${phasePath}.authority`, "Phase authority is invalid."));
        }
        if (phase.teamCount != null) validateCountRule(phase.teamCount, `${phasePath}.teamCount`, issues);
      });
    }

    if (!Array.isArray(tableModel.partitionGroups)) {
      issues.push(issue("PARTITION_GROUPS_INVALID", `${path}.tableModel.partitionGroups`, "Partition groups must be an array."));
    } else {
      const groupIds = new Set();
      tableModel.partitionGroups.forEach((group, groupIndex) => {
        const groupPath = `${path}.tableModel.partitionGroups[${groupIndex}]`;
        if (!isPlainObject(group)) {
          issues.push(issue("PARTITION_GROUP_INVALID", groupPath, "Partition group must be an object."));
          return;
        }
        validateAllowedKeys(
          group,
          ["id", "phaseKeys", "requireDisjoint", "coversPrimaryUniverse", "expectedUnionTeamCount"],
          groupPath,
          issues,
          "PARTITION_GROUP_UNKNOWN_FIELD"
        );
        const id = clean(group.id);
        if (!/^[a-z0-9][a-z0-9._-]*$/.test(id)) {
          issues.push(issue("PARTITION_GROUP_ID_INVALID", `${groupPath}.id`, "Partition group ID is invalid."));
        } else if (groupIds.has(id)) {
          issues.push(issue("PARTITION_GROUP_ID_DUPLICATE", `${groupPath}.id`, "Partition group ID is duplicated."));
        } else {
          groupIds.add(id);
        }
        if (!Array.isArray(group.phaseKeys) || group.phaseKeys.length < 2) {
          issues.push(issue("PARTITION_GROUP_PHASES_INVALID", `${groupPath}.phaseKeys`, "Partition group requires at least two phase keys."));
        } else {
          const local = new Set();
          group.phaseKeys.forEach((key, keyIndex) => {
            if (!phaseKeys.has(key)) {
              issues.push(issue("PARTITION_GROUP_UNKNOWN_PHASE", `${groupPath}.phaseKeys[${keyIndex}]`, "Partition group references an unknown phase."));
            }
            if (local.has(key)) {
              issues.push(issue("PARTITION_GROUP_DUPLICATE_PHASE", `${groupPath}.phaseKeys[${keyIndex}]`, "Partition group repeats a phase key."));
            }
            local.add(key);
          });
        }
        if (typeof group.requireDisjoint !== "boolean") {
          issues.push(issue("PARTITION_GROUP_DISJOINT_INVALID", `${groupPath}.requireDisjoint`, "requireDisjoint must be boolean."));
        }
        if (typeof group.coversPrimaryUniverse !== "boolean") {
          issues.push(issue("PARTITION_GROUP_COVERAGE_INVALID", `${groupPath}.coversPrimaryUniverse`, "coversPrimaryUniverse must be boolean."));
        }
        if (group.expectedUnionTeamCount != null) {
          validateCountRule(group.expectedUnionTeamCount, `${groupPath}.expectedUnionTeamCount`, issues);
        }
      });
    }

    if (scopes.has("PHASE_STRUCTURE")) {
      if (tableModel.format === "UNKNOWN" || !Array.isArray(tableModel.phases) || tableModel.phases.length === 0) {
        issues.push(issue("PHASE_AUTHORITY_WITHOUT_MODEL", `${path}.tableModel`, "PHASE_STRUCTURE authority requires a defined table model and phases."));
      }
      const verifiedPhases = Array.isArray(tableModel.phases) && tableModel.phases.every(phase => phase?.authority === "VERIFIED");
      if (!verifiedPhases) {
        issues.push(issue("PHASE_AUTHORITY_WITH_UNVERIFIED_PHASE", `${path}.tableModel.phases`, "PHASE_STRUCTURE authority requires every declared phase to be VERIFIED."));
      }
    }
  }

  const rules = contract.rules;
  if (!isPlainObject(rules)) {
    issues.push(issue("RULES_INVALID", `${path}.rules`, "Rules descriptor must be an object."));
  } else {
    validateAllowedKeys(
      rules,
      ["promotion", "relegation", "continentalQualification", "tieBreak", "summary"],
      `${path}.rules`,
      issues,
      "RULES_UNKNOWN_FIELD"
    );
    for (const requiredKey of ["promotion", "relegation", "continentalQualification", "tieBreak", "summary"]) {
      if (!Object.hasOwn(rules, requiredKey)) {
        issues.push(issue("RULES_FIELD_MISSING", `${path}.rules.${requiredKey}`, `Rules field ${requiredKey} is required.`));
      }
    }
    if (rules.summary != null && typeof rules.summary !== "string") {
      issues.push(issue("RULES_SUMMARY_INVALID", `${path}.rules.summary`, "Rules summary must be a string or null."));
    }
  }

  const provenance = contract.provenance;
  if (!isPlainObject(provenance)) {
    issues.push(issue("PROVENANCE_INVALID", `${path}.provenance`, "Provenance descriptor must be an object."));
  } else {
    validateAllowedKeys(
      provenance,
      ["seedSchema", "seedGeneratedAt", "seedVerificationStatus", "observedPhaseKeys"],
      `${path}.provenance`,
      issues,
      "PROVENANCE_UNKNOWN_FIELD"
    );
    if (!clean(provenance.seedSchema)) {
      issues.push(issue("PROVENANCE_SEED_SCHEMA_MISSING", `${path}.provenance.seedSchema`, "Seed schema is required."));
    }
    if (!isIsoDateTime(provenance.seedGeneratedAt)) {
      issues.push(issue("PROVENANCE_SEED_DATE_INVALID", `${path}.provenance.seedGeneratedAt`, "Seed generatedAt must be an ISO date-time."));
    }
    if (!clean(provenance.seedVerificationStatus)) {
      issues.push(issue("PROVENANCE_STATUS_MISSING", `${path}.provenance.seedVerificationStatus`, "Seed verification status is required."));
    }
    if (!Array.isArray(provenance.observedPhaseKeys)) {
      issues.push(issue("PROVENANCE_PHASE_KEYS_INVALID", `${path}.provenance.observedPhaseKeys`, "Observed phase keys must be an array."));
    }
  }
}

export function validateCompetitionFormatRegistry(registry) {
  const issues = [];

  if (!isPlainObject(registry)) {
    return {
      ok: false,
      schema: null,
      contractCount: 0,
      issues: [issue("REGISTRY_INVALID", "$", "Registry must be an object.")]
    };
  }

  validateAllowedKeys(
    registry,
    ["schema", "registryVersion", "generatedAt", "status", "policy", "coverage", "contracts"],
    "$",
    issues,
    "REGISTRY_UNKNOWN_FIELD"
  );

  if (registry.schema !== REGISTRY_SCHEMA) {
    issues.push(issue("REGISTRY_SCHEMA_INVALID", "$.schema", `Expected ${REGISTRY_SCHEMA}.`));
  }
  if (!/^\d{4}-\d{2}-\d{2}\.[1-9][0-9]*$/.test(clean(registry.registryVersion))) {
    issues.push(issue("REGISTRY_VERSION_INVALID", "$.registryVersion", "Registry version must be YYYY-MM-DD.N."));
  }
  if (!isIsoDateTime(registry.generatedAt)) {
    issues.push(issue("REGISTRY_GENERATED_AT_INVALID", "$.generatedAt", "generatedAt must be an ISO date-time."));
  }
  if (!REGISTRY_STATUSES.has(registry.status)) {
    issues.push(issue("REGISTRY_STATUS_INVALID", "$.status", "Registry status is invalid."));
  }

  const policy = registry.policy;
  if (!isPlainObject(policy)) {
    issues.push(issue("REGISTRY_POLICY_INVALID", "$.policy", "Registry policy must be an object."));
  } else {
    validateAllowedKeys(
      policy,
      ["readOnlyValidation", "mutationAllowed", "unverifiedContractMode", "verifiedContractMode"],
      "$.policy",
      issues,
      "REGISTRY_POLICY_UNKNOWN_FIELD"
    );
    if (policy.readOnlyValidation !== true) issues.push(issue("REGISTRY_POLICY_NOT_READ_ONLY", "$.policy.readOnlyValidation", "P0-B registry must be read-only."));
    if (policy.mutationAllowed !== false) issues.push(issue("REGISTRY_POLICY_MUTATION_ALLOWED", "$.policy.mutationAllowed", "P0-B registry must forbid mutation."));
    if (policy.unverifiedContractMode !== "REPORT_ONLY") issues.push(issue("REGISTRY_UNVERIFIED_MODE_INVALID", "$.policy.unverifiedContractMode", "Unverified contracts must remain REPORT_ONLY."));
    if (policy.verifiedContractMode !== "STRICT_REPORT_ONLY") issues.push(issue("REGISTRY_VERIFIED_MODE_INVALID", "$.policy.verifiedContractMode", "Verified contracts must remain STRICT_REPORT_ONLY."));
  }

  if (!Array.isArray(registry.contracts)) {
    issues.push(issue("REGISTRY_CONTRACTS_INVALID", "$.contracts", "Registry contracts must be an array."));
  } else {
    const seenContractIds = new Set();
    const seenKeys = new Set();
    registry.contracts.forEach((contract, index) => validateContract(contract, index, issues, seenContractIds, seenKeys));
  }

  if (isPlainObject(registry.coverage) && Array.isArray(registry.contracts)) {
    validateAllowedKeys(
      registry.coverage,
      ["contractCount", "enabledContractCount", "disabledContractCount", "teamCountAuthorityCount", "phaseAuthorityCount", "unverifiedContractCount"],
      "$.coverage",
      issues,
      "REGISTRY_COVERAGE_UNKNOWN_FIELD"
    );
    const enabledCount = registry.contracts.filter(contract => contract?.competition?.enabled === true).length;
    const disabledCount = registry.contracts.filter(contract => contract?.competition?.enabled === false).length;
    const teamCountAuthorityCount = registry.contracts.filter(contract =>
      Array.isArray(contract?.authority?.scopes) && contract.authority.scopes.includes("TEAM_COUNT")
    ).length;
    const phaseAuthorityCount = registry.contracts.filter(contract =>
      Array.isArray(contract?.authority?.scopes) && contract.authority.scopes.includes("PHASE_STRUCTURE")
    ).length;
    const unverifiedCount = registry.contracts.filter(contract =>
      contract?.authority?.status === "UNVERIFIED" || contract?.authority?.status === "NO_BASELINE"
    ).length;

    const expectedCoverage = {
      contractCount: registry.contracts.length,
      enabledContractCount: enabledCount,
      disabledContractCount: disabledCount,
      teamCountAuthorityCount,
      phaseAuthorityCount,
      unverifiedContractCount: unverifiedCount
    };
    for (const [key, expected] of Object.entries(expectedCoverage)) {
      if (registry.coverage[key] !== expected) {
        issues.push(issue("REGISTRY_COVERAGE_MISMATCH", `$.coverage.${key}`, `Coverage ${key} must equal ${expected}.`, "error", {
          expected,
          actual: registry.coverage[key]
        }));
      }
    }
  } else {
    issues.push(issue("REGISTRY_COVERAGE_INVALID", "$.coverage", "Registry coverage must be an object."));
  }

  return {
    ok: issues.every(item => item.severity !== "error"),
    schema: registry.schema || null,
    registryVersion: registry.registryVersion || null,
    contractCount: Array.isArray(registry.contracts) ? registry.contracts.length : 0,
    errorCount: issues.filter(item => item.severity === "error").length,
    warningCount: issues.filter(item => item.severity === "warning").length,
    issues
  };
}

export function buildCompetitionFormatRegistryIndex(registry, options = {}) {
  const validation = options.skipValidation === true
    ? { ok: true, issues: [] }
    : validateCompetitionFormatRegistry(registry);

  if (!validation.ok) {
    const error = new Error("competition_format_registry_invalid");
    error.code = "COMPETITION_FORMAT_REGISTRY_INVALID";
    error.validation = validation;
    throw error;
  }

  const bySlug = new Map();
  for (const contract of registry.contracts || []) {
    const slug = contract.competition.slug;
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(contract);
  }

  for (const contracts of bySlug.values()) {
    contracts.sort((a, b) => {
      const aVersion = Number(a.contractVersion) || 0;
      const bVersion = Number(b.contractVersion) || 0;
      if (bVersion !== aVersion) return bVersion - aVersion;
      return String(b.season.reference).localeCompare(String(a.season.reference));
    });
  }

  return { validation, bySlug };
}

export function resolveCompetitionFormatContract(registryOrIndex, slug, seasonReference = null) {
  const index = registryOrIndex?.bySlug instanceof Map
    ? registryOrIndex
    : buildCompetitionFormatRegistryIndex(registryOrIndex);

  const candidates = index.bySlug.get(clean(slug)) || [];
  if (candidates.length === 0) return null;

  const season = clean(seasonReference);
  if (season) {
    const exact = candidates.find(contract => contract.season.reference === season);
    return exact || null;
  }

  return candidates[0] || null;
}

export function registryAuthoritySummary(registry) {
  const validation = validateCompetitionFormatRegistry(registry);
  const contracts = Array.isArray(registry?.contracts) ? registry.contracts : [];
  return {
    ok: validation.ok,
    registryVersion: registry?.registryVersion || null,
    contracts: contracts.length,
    enabled: contracts.filter(contract => contract?.competition?.enabled === true).length,
    teamCountAuthority: contracts.filter(contract => contract?.authority?.scopes?.includes("TEAM_COUNT")).length,
    phaseAuthority: contracts.filter(contract => contract?.authority?.scopes?.includes("PHASE_STRUCTURE")).length,
    unverified: contracts.filter(contract => ["UNVERIFIED", "NO_BASELINE"].includes(contract?.authority?.status)).length,
    validation
  };
}

export { REGISTRY_SCHEMA };
