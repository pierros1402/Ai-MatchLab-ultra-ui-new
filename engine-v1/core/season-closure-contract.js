import { createHash } from "node:crypto";

const PLAYED = new Set(["FT", "AET", "PEN"]);
const NO_SCORE = new Set(["SCHEDULED", "POSTPONED", "ABANDONED", "SUSPENDED", "VOID", "CANCELLED"]);
const COLUMNS = ["P", "W", "D", "L", "GF", "GA", "GD", "points"];
const DAY_MS = 86_400_000;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

export function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function digest(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function instant(value) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/u.test(value)) return NaN;
  return Date.parse(value);
}

function natural(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function score(value) {
  return Array.isArray(value) && value.length === 2 && value.every(natural);
}

function evidence(value, cutoff) {
  return typeof value?.sourceId === "string" && value.sourceId.length > 0 &&
    typeof value.url === "string" && value.url.startsWith("https://") &&
    digest(value.sha256) && instant(value.availableAt) <= cutoff;
}

function eventPayload(event) {
  const { officialId, canonicalId, home, away, kickoff, status, score, awardScore, regulationScore, penaltyScore, round, phase } = event;
  return { officialId, canonicalId, home, away, kickoff, status, score, awardScore, regulationScore, penaltyScore, round, phase };
}

function emptyStats() {
  return Object.fromEntries(COLUMNS.map(key => [key, 0]));
}

function addGame(table, event, rule) {
  const [homeGoals, awayGoals] = event.status === "AWARDED" ? event.awardScore : event.score;
  const home = table.get(event.home);
  const away = table.get(event.away);
  for (const [row, gf, ga] of [[home, homeGoals, awayGoals], [away, awayGoals, homeGoals]]) {
    row.P += 1;
    row.GF += gf;
    row.GA += ga;
    row.GD += gf - ga;
    if (gf > ga) {
      row.W += 1;
      row.points += rule.win;
    } else if (gf === ga) {
      row.D += 1;
      row.points += rule.draw;
    } else {
      row.L += 1;
      row.points += rule.loss;
    }
  }
}

function rowsById(rows, label, issue) {
  const byId = new Map();
  for (const row of rows ?? []) {
    if (!row?.officialId || byId.has(row.officialId)) {
      issue("NON_UNIQUE_EVENT_ID", row?.officialId ?? null, label);
    } else {
      byId.set(row.officialId, row);
    }
  }
  return byId;
}

function eventParities(event, maps, issue) {
  const names = PLAYED.has(event.status) ? ["canonical", "verified", "history", "index"] : ["canonical"];
  for (const stage of names) {
    const row = maps[stage].get(event.officialId);
    if (!row) {
      issue("MISSING_REQUIRED_STAGE", event.officialId, stage);
    } else if (fingerprint(eventPayload(row)) !== fingerprint(eventPayload(event))) {
      issue("EVENT_FIELD_CONFLICT", event.officialId, stage);
    }
  }
  if (!PLAYED.has(event.status)) {
    for (const stage of ["verified", "history", "index"]) {
      if (maps[stage].has(event.officialId)) issue("NON_PLAYED_IN_PLAYED_STORE", event.officialId, stage);
    }
  }
}

function compareTable(derived, snapshot, phase, label, issue) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) ||
      Object.keys(snapshot).length !== derived.size) {
    issue("STANDINGS_TABLE_MISSING_OR_MEMBERSHIP", null, label, phase);
    return;
  }
  for (const [id, row] of derived) {
    if (!COLUMNS.every(column => snapshot[id]?.[column] === row[column])) {
      issue("STANDINGS_FIELD_CONFLICT", id, label, phase);
    }
  }
}

function valueInput(target, played, asOf) {
  function select(team, side) {
    return played.filter(event => {
      const time = instant(event.kickoff);
      return time < asOf && instant(event.evidence.availableAt) <= asOf &&
        Math.floor((instant(target.kickoff) - time) / DAY_MS) <= 35 &&
        (side === "home" ? event.home === team : side === "away" ? event.away === team :
          event.home === team || event.away === team);
    }).sort((left, right) => instant(right.kickoff) - instant(left.kickoff) ||
      (left.officialId < right.officialId ? -1 : Number(left.officialId !== right.officialId)))
      .slice(0, 5).map(eventPayload);
  }
  const home = select(target.home, "all");
  const away = select(target.away, "all");
  return {
    officialId: target.officialId,
    asOf: new Date(asOf).toISOString(),
    home,
    away,
    homeAtHome: select(target.home, "home"),
    awayAtAway: select(target.away, "away"),
    basis: "current_season_raw",
    minimumSampleMet: home.length >= 3 && away.length >= 3
  };
}

/** Reconcile one explicitly approved season. Input adapters must authenticate evidence and IDs. */
export function reconcileSeason(input) {
  const { contract, checkpoint } = input;
  const issues = [];
  const issue = (code, id = null, stage = null, phase = null) => issues.push({ code, id, stage, phase });
  const cutoff = instant(checkpoint?.asOf);
  if (!Number.isFinite(cutoff) || !digest(checkpoint?.sourceTreeSha256)) issue("UNPINNED_CHECKPOINT");
  if (contract?.scope !== "IN_SCOPE" || !contract.competitionId || !contract.seasonId ||
      !Number.isFinite(instant(contract.startsAt)) || instant(contract.startsAt) > cutoff ||
      !evidence(contract.evidence, cutoff)) issue("SEASON_AUTHORITY_UNPROVEN");
  const phases = new Map();
  for (const phase of contract?.phases ?? []) {
    const valid = phase.id && !phases.has(phase.id) && instant(phase.startsAt) >= instant(contract.startsAt) &&
      instant(phase.startsAt) <= cutoff && natural(phase.expectedCount) && evidence(phase.censusEvidence, cutoff) &&
      phase.censusComplete === true && ["NONE", "POINTS"].includes(phase.tableKind);
    if (!valid) {
      issue("PHASE_CENSUS_OR_RULE_UNPROVEN", phase.id);
      continue;
    }
    phases.set(phase.id, phase);
  }
  if (!phases.size) issue("NO_CERTIFIED_PHASES");

  const official = rowsById(input.official, "official", issue);
  const maps = Object.fromEntries(["canonical", "verified", "history", "index"].map(stage =>
    [stage, rowsById(input[stage], stage, issue)]));
  for (const [stage, rows] of Object.entries(maps)) {
    for (const id of rows.keys()) {
      if (!official.has(id)) issue("EXTRA_UNRECONCILED_EVENT", id, stage);
    }
  }

  const ids = new Set();
  const providerIds = new Map();
  const validEvents = [];
  for (const event of official.values()) {
    const phase = phases.get(event.phase);
    const kickoff = instant(event.kickoff);
    const statusValid = PLAYED.has(event.status) ? score(event.score) && event.awardScore == null && kickoff < cutoff :
      event.status === "AWARDED" ? event.score == null && score(event.awardScore) &&
        evidence(event.adjudication, cutoff) : NO_SCORE.has(event.status) && event.score == null && event.awardScore == null &&
        (event.status !== "SCHEDULED" || kickoff >= cutoff);
    if (!phase || !(kickoff >= instant(phase.startsAt)) || !event.round || !event.home || !event.away ||
        event.home === event.away || !event.canonicalId || ids.has(event.canonicalId) ||
        !Array.isArray(event.providerIds) || !event.providerIds.length ||
        !evidence(event.identityEvidence, cutoff) || !evidence(event.evidence, cutoff) || !statusValid ||
        !["ELIGIBLE", "EXCLUDED"].includes(event.valuePolicy) ||
        (event.valuePolicy === "EXCLUDED" && !evidence(event.valuePolicyEvidence, cutoff)) ||
        (PLAYED.has(event.status) && instant(event.evidence.availableAt) < kickoff)) {
      issue("OFFICIAL_EVENT_IDENTITY_OR_STATE_UNPROVEN", event.officialId, "official", event.phase);
      continue;
    }
    ids.add(event.canonicalId);
    for (const key of event.providerIds) {
      if (typeof key !== "string" || !/^[a-z0-9_-]+:[^\s:]+$/u.test(key) || providerIds.has(key)) {
        issue("PROVIDER_ID_COLLISION_OR_INVALID", event.officialId, "official", event.phase);
      } else {
        providerIds.set(key, event.officialId);
      }
    }
    eventParities(event, maps, issue);
    validEvents.push(event);
  }

  const standings = Object.create(null);
  const seasonPlayed = validEvents.filter(event => PLAYED.has(event.status));
  for (const phase of phases.values()) {
    const matches = validEvents.filter(event => event.phase === phase.id);
    if (matches.length !== phase.expectedCount) issue("PHASE_CONSERVATION_FAILURE", null, "official", phase.id);
    if (phase.tableKind === "NONE") continue;
    const rule = phase.points;
    if (![rule?.win, rule?.draw, rule?.loss].every(natural) || phase.rulesSupported !== true ||
        phase.rankCertified !== true || !evidence(phase.rulesEvidence, cutoff) ||
        !Array.isArray(phase.teams) || !phase.teams.length ||
        !phase.teams.every(id => typeof id === "string" && id.length) ||
        new Set(phase.teams).size !== phase.teams.length ||
        !evidence(phase.tableEvidence, cutoff) || phase.tableAsOf !== checkpoint.asOf) {
      issue("TABLE_RULE_OR_SNAPSHOT_UNPROVEN", null, "standings", phase.id);
      continue;
    }
    const table = new Map(phase.teams.map(id => [id, emptyStats()]));
    for (const event of matches) {
      if (!table.has(event.home) || !table.has(event.away)) {
        issue("UNKNOWN_STANDINGS_PARTICIPANT", event.officialId, "standings", phase.id);
      } else if (event.status === "AET" || event.status === "PEN") {
        issue("TABLE_TERMINAL_RULE_UNSUPPORTED", event.officialId, "standings", phase.id);
      } else if (event.status === "FT" || event.status === "AWARDED") {
        addGame(table, event, rule);
      }
    }
    const adjustmentIds = new Set();
    if (!Array.isArray(phase.adjustments)) {
      issue("ADJUSTMENT_LEDGER_UNPROVEN", null, "standings", phase.id);
    }
    for (const adjustment of phase.adjustments ?? []) {
      if (!adjustment.id || adjustmentIds.has(adjustment.id) || !table.has(adjustment.team) ||
          !Number.isSafeInteger(adjustment.points) || !evidence(adjustment.evidence, cutoff)) {
        issue("UNVERIFIED_TABLE_ADJUSTMENT", adjustment.id, "standings", phase.id);
      } else {
        table.get(adjustment.team).points += adjustment.points;
        adjustmentIds.add(adjustment.id);
      }
    }
    compareTable(table, phase.officialTable, phase.id, "official-table", issue);
    compareTable(table, input.standings?.[phase.id], phase.id, "project-table", issue);
    standings[phase.id] = Object.fromEntries(table);
  }

  const evaluations = [];
  const seenEvaluations = new Set();
  for (const evaluation of input.value ?? []) {
    const target = official.get(evaluation.officialId);
    const asOf = instant(evaluation.asOf);
    if (!evaluation.id || seenEvaluations.has(evaluation.id) || !target ||
        target.valuePolicy !== "ELIGIBLE" || !(asOf < instant(target.kickoff)) || !(asOf <= cutoff)) {
      issue("UNVERIFIED_VALUE_EVALUATION", evaluation.officialId, "value");
      continue;
    }
    seenEvaluations.add(evaluation.id);
    const shared = valueInput(target, seasonPlayed, asOf);
    const expectedHash = fingerprint(shared);
    if (evaluation.planAInputHash !== expectedHash || evaluation.planBInputHash !== expectedHash) {
      issue("VALUE_INPUT_PARITY_FAILURE", evaluation.officialId, "value");
    }
    evaluations.push({ evaluationId: evaluation.id, inputHash: expectedHash, shared });
  }
  if (!evidence(input.valueCensusEvidence, cutoff) || input.valueCensusComplete !== true ||
      !Array.isArray(input.expectedValueEvaluations) ||
      new Set(input.expectedValueEvaluations).size !== seenEvaluations.size ||
      input.expectedValueEvaluations.length !== seenEvaluations.size ||
      !input.expectedValueEvaluations.every(id => seenEvaluations.has(id))) {
    issue("VALUE_EVALUATION_CENSUS_UNPROVEN");
  }
  return { verdict: issues.length ? "HOLD" : "VERIFIED_INPUTS", issues, standings, evaluations };
}

const REQUIRED_RIGHTS = ["AUTOMATED_INGEST", "RETAIN_EVIDENCE", "DERIVE_INTERNAL_PROJECTIONS"];
const PERMITTED_ACCESS = new Set(["OFFICIAL_API", "LICENSED_FEED", "LICENSED_DATASET"]);

function sortedIds(values) {
  return Array.isArray(values) ? [...values].sort() : null;
}

/** The same reconciliation pipeline, with an independently pinned official denominator and reviewed IDs. */
export function reconcileRegisteredSeason(input, registry, expectedRegistryFingerprint) {
  const result = reconcileSeason(input);
  const issues = [...result.issues];
  const contract = input.contract;
  const cutoff = instant(input.checkpoint?.asOf);
  const scope = [contract?.competitionId ?? null, contract?.seasonId ?? null];
  const hold = (code, fields = {}) => issues.push({
    code, competitionId: scope[0], seasonId: scope[1], registryVersion: registry?.version ?? null, ...fields
  });

  if (registry?.schema !== "ai-matchlab.official-competition-evidence-registry.v1" ||
      !digest(expectedRegistryFingerprint) || fingerprint(registry) !== expectedRegistryFingerprint) {
    hold("OFFICIAL_REGISTRY_UNPINNED_OR_DRIFTED");
    return { ...result, verdict: "HOLD", issues };
  }
  const entries = (registry.competitions ?? []).filter(row => row.competitionId === scope[0]);
  const competition = entries.length === 1 ? entries[0] : null;
  const seasons = competition?.seasons?.filter(season => season.id === scope[1]) ?? [];
  const season = seasons.length === 1 ? seasons[0] : null;
  if (!season || competition.scope !== "APPROVED" || !competition.organizer ||
      !evidence(competition.scopeEvidence, cutoff) ||
      !(instant(competition.effectiveFrom) <= cutoff) ||
      (competition.effectiveUntil != null && !(cutoff < instant(competition.effectiveUntil)))) {
    hold("OFFICIAL_SCOPE_OR_SEASON_UNVERIFIED", {
      blockers: season?.blockers ?? competition?.blockers ?? ["NO_UNIQUE_APPROVED_COMPETITION_SEASON"]
    });
    return { ...result, verdict: "HOLD", issues };
  }
  if (season.startsAt !== contract.startsAt || !evidence(season.calendar, cutoff) ||
      season.calendar.sourceId !== contract.evidence?.sourceId ||
      season.calendar.sha256 !== contract.evidence?.sha256) {
    hold("OFFICIAL_CALENDAR_BINDING_UNVERIFIED", { source: season.calendar ?? null });
  }

  const sources = new Map();
  for (const source of season.sources ?? []) {
    if (!source.id || sources.has(source.id)) {
      hold("OFFICIAL_SOURCE_ID_CONFLICT", { sourceId: source.id ?? null });
      continue;
    }
    sources.set(source.id, source);
  }
  let publicReleaseAllowed = true;
  function checkSource(item, phase, officialId = null) {
    const source = sources.get(item?.sourceId);
    const grant = source?.grant;
    const permitted = source && evidence(item, cutoff) && PERMITTED_ACCESS.has(source.accessMethod) &&
      ["OFFICIAL_ORGANIZER", "AUTHORIZED_OFFICIAL_DISTRIBUTOR"].includes(source.authority) &&
      grant?.status === "APPROVED" && evidence(grant.evidence, cutoff) &&
      instant(grant.from) <= cutoff && instant(grant.until) > cutoff &&
      REQUIRED_RIGHTS.every(right => grant.scopes?.includes(right)) &&
      grant.competitionIds?.includes(scope[0]) && grant.seasonIds?.includes(scope[1]);
    if (!permitted || !grant.scopes.includes("PUBLISH_DERIVED")) publicReleaseAllowed = false;
    if (!permitted) hold("OFFICIAL_SOURCE_ACCESS_UNVERIFIED", {
      phase, officialId, sourceId: item?.sourceId ?? null, sourceUrl: item?.url ?? source?.url ?? null,
      sourceSha256: item?.sha256 ?? null, accessMethod: source?.accessMethod ?? null
    });
  }

  checkSource(season.calendar, null);
  const official = input.official ?? [];
  const phases = season.phases ?? [];
  if (new Set(phases.map(phase => phase.id)).size !== phases.length ||
      phases.length !== contract.phases?.length ||
      !contract.phases.every(phase => phases.some(officialPhase => officialPhase.id === phase.id))) {
    hold("OFFICIAL_PHASE_MEMBERSHIP_UNVERIFIED");
  }
  for (const phase of phases) {
    const expected = contract.phases?.find(item => item.id === phase.id);
    const rows = official.filter(row => row.phase === phase.id)
      .sort((a, b) => String(a.officialId).localeCompare(String(b.officialId), "en"));
    const ids = new Set(phase.officialIds ?? []);
    const observedIds = new Set(rows.map(row => row.officialId));
    const missingOfficialIds = [...ids].filter(id => !observedIds.has(id)).sort();
    const unexpectedOfficialIds = [...observedIds].filter(id => !ids.has(id)).sort();
    checkSource(phase.census, phase.id);
    if (phase.tableKind === "POINTS") {
      checkSource(phase.rules, phase.id);
      checkSource(expected?.tableEvidence, phase.id);
      for (const adjustment of expected?.adjustments ?? []) checkSource(adjustment.evidence, phase.id);
    }
    if (phase.tableKind !== expected?.tableKind || phase.startsAt !== expected?.startsAt ||
        phase.asOf !== input.checkpoint.asOf || phase.status !== "COMPLETE_VERIFIED" || !expected || expected.expectedCount !== ids.size ||
        expected.censusEvidence?.sourceId !== phase.census?.sourceId ||
        expected.censusEvidence?.sha256 !== phase.census?.sha256 ||
        (phase.tableKind === "POINTS" && (expected.rulesEvidence?.sourceId !== phase.rules?.sourceId ||
          expected.rulesEvidence?.sha256 !== phase.rules?.sha256)) ||
        ids.size !== phase.officialIds?.length || rows.length !== ids.size ||
        missingOfficialIds.length || unexpectedOfficialIds.length ||
        !digest(phase.censusFingerprint) || fingerprint(rows) !== phase.censusFingerprint) {
      hold("OFFICIAL_CENSUS_NOT_RECONCILED", {
        phase: phase.id, source: phase.census ?? null, registeredCount: ids.size,
        observedCount: rows.length, missingOfficialIds, unexpectedOfficialIds
      });
    }
  }

  const links = new Map();
  for (const link of season.identityDecisions ?? []) {
    if (links.has(link.officialId)) hold("OFFICIAL_IDENTITY_DECISION_CONFLICT", { officialId: link.officialId });
    else links.set(link.officialId, link);
  }
  for (const row of official) {
    checkSource(row.evidence, row.phase, row.officialId);
    if ((["AET", "PEN"].includes(row.status) && !score(row.regulationScore)) ||
        (row.status === "PEN" && (!score(row.penaltyScore) || row.penaltyScore[0] === row.penaltyScore[1]))) {
      hold("OFFICIAL_TERMINAL_SCORE_COMPONENT_UNVERIFIED", { officialId: row.officialId, phase: row.phase, source: row.evidence });
    }
    if (row.status === "AWARDED") checkSource(row.adjudication, row.phase, row.officialId);
    const link = links.get(row.officialId);
    if (link?.status !== "APPROVED" || !link.reviewId || !evidence(link.evidence, cutoff) ||
        link.evidence.sha256 !== row.identityEvidence?.sha256 ||
        link.canonicalId !== row.canonicalId || link.home !== row.home || link.away !== row.away ||
        fingerprint(sortedIds(link.providerIds)) !== fingerprint(sortedIds(row.providerIds))) {
      hold("OFFICIAL_IDENTITY_LINK_UNVERIFIED", {
        officialId: row.officialId, phase: row.phase, sourceId: row.evidence?.sourceId ?? null,
        sourceSha256: row.evidence?.sha256 ?? null, canonicalId: row.canonicalId ?? null
      });
    }
  }
  return { ...result, verdict: issues.length ? "HOLD" : result.verdict, issues,
    registryBinding: issues.length ? null : { fingerprint: expectedRegistryFingerprint, competitionId: scope[0], seasonId: scope[1], publicReleaseAllowed } };
}

/** Validate a promotion proposal against a pinned writer and independent readbacks. No I/O. */
export function certifyPromotion({ reconciliation, expectedBase, currentBase, artifacts, requiredPaths, local, github, publicReadback }) {
  const issues = [];
  if (reconciliation?.verdict !== "VERIFIED_INPUTS" || !digest(reconciliation.registryBinding?.fingerprint) ||
      reconciliation.registryBinding.publicReleaseAllowed !== true) issues.push("CONSERVATION_GATE_HELD");
  if (!digest(expectedBase) || expectedBase !== currentBase) issues.push("STALE_WRITER_BASE");
  if (!artifacts || !Object.keys(artifacts).length) issues.push("EMPTY_ARTIFACT_SET");
  if (!Array.isArray(requiredPaths) || !requiredPaths.length ||
      new Set(requiredPaths).size !== Object.keys(artifacts ?? {}).length ||
      !requiredPaths.every(path => Object.hasOwn(artifacts ?? {}, path))) issues.push("ARTIFACT_MEMBERSHIP_MISMATCH");
  for (const [path, expectedHash] of Object.entries(artifacts ?? {})) {
    if (!digest(expectedHash) || ![local, github, publicReadback].every(readback => readback?.[path] === expectedHash)) {
      issues.push("ARTIFACT_READBACK_MISMATCH:" + path);
    }
  }
  return { verdict: issues.length ? "HOLD" : "VERIFIED_READBACK", issues, artifactSetHash: fingerprint(artifacts ?? {}),
    registryBinding: issues.length ? null : reconciliation.registryBinding };
}
