import fs from "node:fs";
import path from "node:path";
import {
  fileURLToPath
} from "node:url";

import {
  findCanonicalStatusConflicts
} from "../core/canonical-status-coherence.js";

import {
  applyCanonicalSuppressedAliasTerminalRepair
} from "../core/canonical-suppressed-alias-terminal-repair.js";

import {
  resolveDataPath
} from "../storage/data-root.js";

function clean(value) {
  return String(value ?? "").trim();
}

function isDayKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/u
    .test(clean(value));
}

function readJson(file) {
  return JSON.parse(
    fs.readFileSync(
      file,
      "utf8"
    )
  );
}

function rowsWithShape(payload) {
  if (Array.isArray(payload)) {
    return {
      rows:
        payload,
      key:
        null
    };
  }

  for (const key of [
    "fixtures",
    "matches",
    "rows"
  ]) {
    if (
      Array.isArray(
        payload?.[key]
      )
    ) {
      return {
        rows:
          payload[key],
        key
      };
    }
  }

  return {
    rows: [],
    key: null
  };
}

function rowId(row) {
  return clean(
    row?.canonicalId ||
    row?.matchId ||
    row?.id
  );
}

function strictScore(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return (
    Number.isInteger(number) &&
    number >= 0
  )
    ? number
    : null;
}

function scorePair(row) {
  const home = strictScore(
    row?.scoreHome ??
    row?.homeScore ??
    row?.home ??
    row?.finalScore?.homeScore ??
    row?.finalScore?.home
  );

  const away = strictScore(
    row?.scoreAway ??
    row?.awayScore ??
    row?.away ??
    row?.finalScore?.awayScore ??
    row?.finalScore?.away
  );

  return (
    home === null ||
    away === null
  )
    ? null
    : { home, away };
}

function sameScore(left, right) {
  return Boolean(
    left &&
    right &&
    left.home === right.home &&
    left.away === right.away
  );
}

function scoreKey(score) {
  return score
    ? `${score.home}-${score.away}`
    : "";
}

function availableDays(root) {
  if (!fs.existsSync(root)) {
    return [];
  }

  return fs
    .readdirSync(
      root,
      {
        withFileTypes:
          true
      }
    )
    .filter(entry =>
      entry.isDirectory() &&
      isDayKey(
        entry.name
      )
    )
    .map(entry =>
      entry.name
    )
    .sort();
}

function writeJsonAtomic(
  file,
  payload
) {
  const temp =
    `${file}.tmp-${process.pid}-${Date.now()}`;

  fs.writeFileSync(
    temp,
    `${JSON.stringify(
      payload,
      null,
      2
    )}\n`,
    "utf8"
  );

  fs.renameSync(
    temp,
    file
  );
}

function decisionsFrom(payload) {
  return Array.isArray(
    payload?.fixtureLineageDecisions
  )
    ? payload.fixtureLineageDecisions
    : [];
}

function decisionForSuppressedId(
  payload,
  matchId
) {
  return decisionsFrom(payload)
    .find(decision =>
      Array.isArray(
        decision
          ?.suppressedRepositoryFixtureIds
      ) &&
      decision
        .suppressedRepositoryFixtureIds
        .map(clean)
        .includes(
          matchId
        )
    ) || null;
}

function normalizedDecisionBinding(decision) {
  const suppressed = [
    ...(decision
      ?.suppressedRepositoryFixtureIds || [])
  ].map(clean).sort();

  const sourceFixtures =
    (
      Array.isArray(
        decision?.sourceFixtures
      )
        ? decision.sourceFixtures
        : []
    )
      .map(source => ({
        provider:
          clean(source?.provider)
            .toLowerCase(),
        providerMatchId:
          clean(source?.providerMatchId),
        repositoryFixtureId:
          clean(source?.repositoryFixtureId),
        dayKey:
          clean(source?.dayKey),
        leagueSlug:
          clean(source?.leagueSlug),
        kickoffUtc:
          clean(source?.kickoffUtc),
        homeTeam:
          clean(source?.homeTeam),
        awayTeam:
          clean(source?.awayTeam)
      }))
      .sort((a, b) =>
        JSON.stringify(a)
          .localeCompare(
            JSON.stringify(b)
          )
      );

  return {
    fixtureRetentionDecisionId:
      clean(
        decision
          ?.fixtureRetentionDecisionId
      ),
    retainedRepositoryFixtureId:
      clean(
        decision
          ?.retainedRepositoryFixtureId
      ),
    suppressed,
    dayKey:
      clean(decision?.dayKey),
    leagueSlug:
      clean(decision?.leagueSlug),
    promotionBasis:
      clean(decision?.promotionBasis),
    homeGlobalClubId:
      clean(decision?.homeGlobalClubId),
    awayGlobalClubId:
      clean(decision?.awayGlobalClubId),
    sourceFixtures
  };
}

function sameDecision(left, right) {
  if (!left || !right) {
    return false;
  }

  return JSON.stringify(
    normalizedDecisionBinding(left)
  ) === JSON.stringify(
    normalizedDecisionBinding(right)
  );
}

function exactProviderSource(
  sources,
  canonicalRow
) {
  const provider =
    clean(canonicalRow?.source)
      .toLowerCase();

  const providerMatchId =
    clean(
      canonicalRow?.sourceId ||
      canonicalRow?.sourceMatchId
    );

  return (
    Array.isArray(sources)
      ? sources
      : []
  ).find(source =>
    clean(source?.provider)
      .toLowerCase() === provider &&
    clean(source?.providerMatchId) ===
      providerMatchId
  ) || null;
}

function evidenceFromRetainedFinal({
  canonicalRow,
  decision,
  finalRoot,
  dayKey
}) {
  const retainedFixtureId =
    clean(
      decision
        ?.retainedRepositoryFixtureId
    );

  const decisionId =
    clean(
      decision
        ?.fixtureRetentionDecisionId
    );

  const matchId =
    rowId(canonicalRow);

  const file =
    path.join(
      finalRoot,
      dayKey,
      `${retainedFixtureId}.json`
    );

  if (
    !retainedFixtureId ||
    !fs.existsSync(file)
  ) {
    return null;
  }

  const retainedFinal =
    readJson(file);

  if (
    retainedFinal?.verifiedFinalTruth !==
      true ||
    rowId(retainedFinal) !==
      retainedFixtureId ||
    clean(
      retainedFinal?.dayKey ||
      retainedFinal?.date
    ) !== dayKey ||
    (
      clean(retainedFinal?.leagueSlug) &&
      clean(retainedFinal?.leagueSlug) !==
        clean(decision?.leagueSlug)
    )
  ) {
    return null;
  }

  const reconciliation =
    retainedFinal
      ?.productionIdentityReconciliation;

  if (
    clean(
      reconciliation?.retainedFixtureId
    ) !== retainedFixtureId ||
    clean(
      reconciliation
        ?.fixtureRetentionDecisionId
    ) !== decisionId
  ) {
    return null;
  }

  const suppressed =
    (
      Array.isArray(
        reconciliation
          ?.suppressedArtifacts
      )
        ? reconciliation
            .suppressedArtifacts
        : []
    ).find(artifact =>
      clean(
        artifact?.sourceFixtureId ||
        artifact?.originalMatchId
      ) === matchId
    ) || null;

  if (
    !suppressed ||
    suppressed?.verification?.verdict !==
      "verified_final_result"
  ) {
    return null;
  }

  const providerEvidence =
    exactProviderSource(
      suppressed?.sources,
      canonicalRow
    );

  const providerScore =
    scorePair(providerEvidence);

  const retainedScore =
    scorePair(retainedFinal);

  if (
    !providerEvidence ||
    !providerScore ||
    !sameScore(
      providerScore,
      retainedScore
    ) ||
    (
      clean(suppressed?.scoreKey) &&
      clean(suppressed?.scoreKey) !==
        scoreKey(providerScore)
    )
  ) {
    return null;
  }

  return {
    verifiedFinalTruth:
      true,
    mode:
      "retained_final_suppressed_artifact",
    sourceFixtureId:
      matchId,
    retainedFixtureId,
    fixtureRetentionDecisionId:
      decisionId,
    dayKey,
    leagueSlug:
      clean(canonicalRow?.leagueSlug),
    provider:
      clean(providerEvidence?.provider),
    providerMatchId:
      clean(providerEvidence?.providerMatchId),
    homeTeam:
      providerEvidence?.home ??
      providerEvidence?.homeTeam ??
      null,
    awayTeam:
      providerEvidence?.away ??
      providerEvidence?.awayTeam ??
      null,
    kickoffUtc:
      providerEvidence?.kickoffUtc ??
      null,
    scoreHome:
      providerScore.home,
    scoreAway:
      providerScore.away,
    evidencePath:
      file
  };
}

function evidenceFromQuarantinedAlias({
  canonicalRow,
  decision,
  finalRoot,
  quarantineRoot,
  dayKey
}) {
  const matchId =
    rowId(canonicalRow);

  const retainedFixtureId =
    clean(
      decision
        ?.retainedRepositoryFixtureId
    );

  const decisionId =
    clean(
      decision
        ?.fixtureRetentionDecisionId
    );

  const aliasDir =
    path.join(
      quarantineRoot,
      "final-result-aliases",
      dayKey
    );

  const aliasFile =
    path.join(
      aliasDir,
      `${matchId}.json`
    );

  const manifestFile =
    `${aliasFile}.manifest.json`;

  const retainedFile =
    path.join(
      finalRoot,
      dayKey,
      `${retainedFixtureId}.json`
    );

  if (
    !matchId ||
    !retainedFixtureId ||
    !fs.existsSync(aliasFile) ||
    !fs.existsSync(manifestFile) ||
    !fs.existsSync(retainedFile)
  ) {
    return null;
  }

  const alias =
    readJson(aliasFile);

  const manifest =
    readJson(manifestFile);

  const retained =
    readJson(retainedFile);

  if (
    manifest?.schema !==
      "ai-matchlab.suppressed-final-result-alias-repair.v1" ||
    clean(manifest?.dayKey) !==
      dayKey ||
    clean(manifest?.aliasFixtureId) !==
      matchId ||
    clean(manifest?.targetFixtureId) !==
      retainedFixtureId ||
    manifest?.reason !==
      "SAME_TRUTH_SUPPRESSED_ALIAS" ||
    manifest?.reversible !==
      true ||
    alias?.verifiedFinalTruth !==
      true ||
    rowId(alias) !==
      matchId ||
    clean(
      alias?.dayKey ||
      alias?.date
    ) !== dayKey ||
    (
      clean(alias?.leagueSlug) &&
      clean(alias?.leagueSlug) !==
        clean(decision?.leagueSlug)
    ) ||
    retained?.verifiedFinalTruth !==
      true ||
    rowId(retained) !==
      retainedFixtureId ||
    clean(
      retained?.dayKey ||
      retained?.date
    ) !== dayKey ||
    (
      clean(retained?.leagueSlug) &&
      clean(retained?.leagueSlug) !==
        clean(decision?.leagueSlug)
    )
  ) {
    return null;
  }

  const aliasScore =
    scorePair(alias);

  const retainedScore =
    scorePair(retained);

  if (
    !sameScore(
      aliasScore,
      retainedScore
    ) ||
    clean(manifest?.aliasScore) !==
      scoreKey(aliasScore) ||
    clean(manifest?.targetScore) !==
      scoreKey(retainedScore)
  ) {
    return null;
  }

  const providerEvidence =
    exactProviderSource(
      alias?.sources,
      canonicalRow
    );

  if (
    !providerEvidence ||
    !sameScore(
      aliasScore,
      scorePair(providerEvidence)
    )
  ) {
    return null;
  }

  return {
    verifiedFinalTruth:
      true,
    mode:
      "quarantined_same_truth_alias",
    sourceFixtureId:
      matchId,
    retainedFixtureId,
    fixtureRetentionDecisionId:
      decisionId,
    dayKey,
    leagueSlug:
      clean(canonicalRow?.leagueSlug),
    provider:
      clean(providerEvidence?.provider),
    providerMatchId:
      clean(providerEvidence?.providerMatchId),
    homeTeam:
      providerEvidence?.home ??
      providerEvidence?.homeTeam ??
      null,
    awayTeam:
      providerEvidence?.away ??
      providerEvidence?.awayTeam ??
      null,
    kickoffUtc:
      providerEvidence?.kickoffUtc ??
      null,
    scoreHome:
      aliasScore.home,
    scoreAway:
      aliasScore.away,
    evidencePath:
      aliasFile,
    manifestPath:
      manifestFile
  };
}

export function repairCanonicalSuppressedAliasTerminalConflictsRange({
  from = "",
  to = "",
  write = false,
  repairedAt =
    new Date().toISOString(),
  canonicalRoot =
    resolveDataPath(
      "canonical-fixtures"
    ),
  finalRoot =
    resolveDataPath(
      "final-results"
    ),
  quarantineRoot =
    resolveDataPath(
      "quarantine"
    ),
  identityRecoveryFile =
    path.join(
      resolveDataPath(
        "identity-decisions"
      ),
      "production-identity-recovery-supplement.v1.json"
    ),
  identityExtensionFile =
    path.join(
      resolveDataPath(
        "identity-decisions"
      ),
      "production-identity-extension-ledger.v1.json"
    )
} = {}) {
  const requestedFrom =
    clean(from);

  const requestedTo =
    clean(to);

  if (
    requestedFrom &&
    !isDayKey(
      requestedFrom
    )
  ) {
    throw new Error(
      `invalid_from_day:${requestedFrom}`
    );
  }

  if (
    requestedTo &&
    !isDayKey(
      requestedTo
    )
  ) {
    throw new Error(
      `invalid_to_day:${requestedTo}`
    );
  }

  if (
    requestedFrom &&
    requestedTo &&
    requestedFrom > requestedTo
  ) {
    throw new Error(
      `invalid_day_range:${requestedFrom}:${requestedTo}`
    );
  }

  if (
    !fs.existsSync(
      identityRecoveryFile
    ) ||
    !fs.existsSync(
      identityExtensionFile
    )
  ) {
    throw new Error(
      "identity_decision_ledgers_required"
    );
  }

  const recoveryLedger =
    readJson(
      identityRecoveryFile
    );

  const extensionLedger =
    readJson(
      identityExtensionFile
    );

  const days =
    availableDays(
      canonicalRoot
    ).filter(day =>
      (
        !requestedFrom ||
        day >= requestedFrom
      ) &&
      (
        !requestedTo ||
        day <= requestedTo
      )
    );

  if (
    (
      requestedFrom ||
      requestedTo
    ) &&
    days.length === 0
  ) {
    throw new Error(
      `canonical_suppressed_alias_terminal_repair_range_empty:${requestedFrom || "*"}:${requestedTo || "*"}`
    );
  }

  const report = {
    schema:
      "ai-matchlab.canonical-suppressed-alias-terminal-repair-range.v1",
    generatedAt:
      repairedAt,
    from:
      requestedFrom || null,
    to:
      requestedTo || null,
    writeRequested:
      write === true,
    daysScanned:
      days.length,
    filesScanned:
      0,
    rowsScanned:
      0,
    topLevelConflictRows:
      0,
    repairableRows:
      0,
    repairedRows:
      0,
    filesWritten:
      0,
    byMode:
      {},
    unresolvedByReason:
      {},
    repairs:
      [],
    unresolved:
      []
  };

  for (const dayKey of days) {
    const dir =
      path.join(
        canonicalRoot,
        dayKey
      );

    const files =
      fs
        .readdirSync(
          dir
        )
        .filter(name =>
          name.endsWith(
            ".json"
          )
        )
        .sort();

    for (const name of files) {
      const file =
        path.join(
          dir,
          name
        );

      const payload =
        readJson(file);

      const shaped =
        rowsWithShape(payload);

      report.filesScanned++;
      report.rowsScanned +=
        shaped.rows.length;

      let changed =
        false;

      const nextRows =
        shaped.rows.map(
          (row, index) => {
            const conflicts =
              findCanonicalStatusConflicts(
                {
                  fixtures:
                    [row]
                },
                {
                  path:
                    file
                }
              );

            if (
              !conflicts.some(
                conflict =>
                  conflict.surface ===
                    "canonical"
              )
            ) {
              return row;
            }

            report.topLevelConflictRows++;

            const matchId =
              rowId(row);

            const recoveryDecision =
              decisionForSuppressedId(
                recoveryLedger,
                matchId
              );

            const extensionDecision =
              decisionForSuppressedId(
                extensionLedger,
                matchId
              );

            if (
              !sameDecision(
                recoveryDecision,
                extensionDecision
              )
            ) {
              const reason =
                "identity_ledgers_disagree_or_missing";

              report.unresolved.push({
                dayKey,
                file:
                  name,
                index,
                matchId:
                  matchId || null,
                reason
              });

              report.unresolvedByReason[reason] =
                Number(
                  report
                    .unresolvedByReason[reason] ||
                  0
                ) + 1;

              return row;
            }

            const decision =
              recoveryDecision;

            const evidence =
              evidenceFromRetainedFinal({
                canonicalRow:
                  row,
                decision,
                finalRoot,
                dayKey
              }) ||
              evidenceFromQuarantinedAlias({
                canonicalRow:
                  row,
                decision,
                finalRoot,
                quarantineRoot,
                dayKey
              });

            if (!evidence) {
              const reason =
                "identity_bound_verified_final_evidence_missing";

              report.unresolved.push({
                dayKey,
                file:
                  name,
                index,
                matchId:
                  matchId || null,
                reason
              });

              report.unresolvedByReason[reason] =
                Number(
                  report
                    .unresolvedByReason[reason] ||
                  0
                ) + 1;

              return row;
            }

            const result =
              applyCanonicalSuppressedAliasTerminalRepair({
                canonicalRow:
                  row,
                identityDecision:
                  decision,
                evidence,
                dayKey,
                repairedAt
              });

            if (!result.changed) {
              const reason =
                result.reason ||
                "repair_not_applied";

              report.unresolved.push({
                dayKey,
                file:
                  name,
                index,
                matchId:
                  matchId || null,
                reason
              });

              report.unresolvedByReason[reason] =
                Number(
                  report
                    .unresolvedByReason[reason] ||
                  0
                ) + 1;

              return row;
            }

            changed =
              true;

            report.repairableRows++;
            report.repairedRows++;

            const mode =
              result
                .evaluation
                .mode;

            report.byMode[mode] =
              Number(
                report.byMode[mode] ||
                0
              ) + 1;

            report.repairs.push({
              dayKey,
              file:
                name,
              index,
              matchId:
                matchId || null,
              mode,
              retainedFixtureId:
                result
                  .evaluation
                  .retainedFixtureId,
              fixtureRetentionDecisionId:
                result
                  .evaluation
                  .fixtureRetentionDecisionId,
              provider:
                evidence.provider,
              providerMatchId:
                evidence.providerMatchId,
              evidencePath:
                evidence.evidencePath
            });

            return result.row;
          }
        );

      if (!changed) {
        continue;
      }

      const nextPayload =
        shaped.key === null
          ? nextRows
          : {
              ...payload,
              [shaped.key]:
                nextRows,
              updatedAt:
                repairedAt
            };

      for (
        const repair of
        report.repairs.filter(
          item =>
            item.dayKey ===
              dayKey &&
            item.file ===
              name
        )
      ) {
        const remaining =
          findCanonicalStatusConflicts(
            {
              fixtures: [
                nextRows[
                  repair.index
                ]
              ]
            },
            {
              path:
                file
            }
          );

        if (
          remaining.length > 0
        ) {
          throw new Error(
            `suppressed_alias_terminal_repair_postcondition_failed:${dayKey}:${name}:${repair.index}:${remaining.length}`
          );
        }
      }

      if (write === true) {
        writeJsonAtomic(
          file,
          nextPayload
        );

        report.filesWritten++;
      }
    }
  }

  report.unresolvedRows =
    report.unresolved.length;

  report.complete =
    report.unresolvedRows === 0;

  report.ok =
    true;

  report.writeApplied =
    write === true;

  return report;
}

const isCli =
  process.argv[1] &&
  fileURLToPath(
    import.meta.url
  ) ===
    path.resolve(
      process.argv[1]
    );

if (isCli) {
  try {
    const args =
      process.argv
        .slice(2)
        .map(clean);

    const from =
      args
        .find(arg =>
          arg.startsWith(
            "--from="
          )
        )
        ?.slice(
          "--from=".length
        ) || "";

    const to =
      args
        .find(arg =>
          arg.startsWith(
            "--to="
          )
        )
        ?.slice(
          "--to=".length
        ) || "";

    const write =
      args.includes(
        "--write"
      );

    const result =
      repairCanonicalSuppressedAliasTerminalConflictsRange({
        from,
        to,
        write
      });

    console.log(
      JSON.stringify(
        result,
        null,
        2
      )
    );
  }
  catch (error) {
    console.error(error);
    process.exit(1);
  }
}
