import { teamPairMatches } from "./team-identity.js";
import { classifyMatchState, MATCH_STATE_CLASS } from "./non-played-state.js";

function clean(value) {
  return String(value ?? "").trim();
}

function providerIdOf(row) {
  return clean(
    row?.providerMatchId ||
    row?.sourceId ||
    row?.sourceMatchId ||
    (
      /^\d+$/u.test(clean(row?.matchId))
        ? row?.matchId
        : ""
    )
  );
}

function kickoffOf(row) {
  return (
    row?.kickoffUtc ||
    row?.kickoff ||
    row?.startUtc ||
    row?.startTime ||
    null
  );
}

function athensDayOf(value) {
  const raw = clean(value);

  if (!raw) {
    return "";
  }

  const parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleDateString(
    "en-CA",
    {
      timeZone:
        "Europe/Athens"
    }
  );
}

function cleanUpper(value) {
  return clean(value).toUpperCase();
}

const PRIMARY_TERMINAL_STATUS = new Set([
  "FT",
  "FULL_TIME",
  "FINAL",
  "AET",
  "PEN"
]);

function normalizedPrimaryTerminalStatus(row) {
  const status = cleanUpper(row?.status);

  if (PRIMARY_TERMINAL_STATUS.has(status)) {
    if (status === "FULL_TIME" || status === "FINAL") return "FT";
    return status;
  }

  return "FT";
}

function strictScore(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  return (
    Number.isInteger(number) &&
    number >= 0
  )
    ? number
    : null;
}

export function evaluateAuthoritativeTerminalWriteback({
  canonicalRow,
  observationRow,
  dayKey
} = {}) {
  const canonicalProviderId =
    providerIdOf(canonicalRow);

  const observationProviderId =
    providerIdOf(observationRow);

  if (
    !canonicalProviderId ||
    !observationProviderId ||
    canonicalProviderId !==
      observationProviderId
  ) {
    return {
      ok: false,
      reason:
        "exact_provider_id_mismatch"
    };
  }

  const expectedDay =
    clean(dayKey);

  const canonicalDay =
    athensDayOf(
      kickoffOf(canonicalRow)
    );

  const observationDay =
    athensDayOf(
      kickoffOf(observationRow)
    );

  if (
    !/^\d{4}-\d{2}-\d{2}$/u
      .test(expectedDay) ||
    canonicalDay !== expectedDay ||
    observationDay !== expectedDay
  ) {
    return {
      ok: false,
      reason:
        "athens_day_mismatch"
    };
  }

  if (
    !teamPairMatches(
      canonicalRow?.homeTeam,
      canonicalRow?.awayTeam,
      observationRow?.homeTeam,
      observationRow?.awayTeam
    )
  ) {
    return {
      ok: false,
      reason:
        "ordered_team_identity_mismatch"
    };
  }

  const matchState =
    classifyMatchState(
      observationRow
    );

  if (matchState === MATCH_STATE_CLASS.CONFLICT) {
    return {
      ok: false,
      reason:
        "conflicting_match_state_evidence"
    };
  }

  if (matchState !== MATCH_STATE_CLASS.PLAYED_FINAL) {
    return {
      ok: false,
      reason:
        "explicit_terminal_status_required"
    };
  }

  const scoreHome =
    strictScore(
      observationRow?.scoreHome
    );

  const scoreAway =
    strictScore(
      observationRow?.scoreAway
    );

  if (
    scoreHome === null ||
    scoreAway === null
  ) {
    return {
      ok: false,
      reason:
        "valid_numeric_score_required"
    };
  }

  return {
    ok: true,
    reason: null,
    providerMatchId:
      canonicalProviderId,
    dayKey:
      expectedDay,
    scoreHome,
    scoreAway
  };
}

export function applyAuthoritativeTerminalWriteback({
  canonicalRow,
  observationRow,
  dayKey,
  promotedAt =
    new Date().toISOString()
} = {}) {
  const decision =
    evaluateAuthoritativeTerminalWriteback({
      canonicalRow,
      observationRow,
      dayKey
    });

  if (!decision.ok) {
    return {
      changed: false,
      row:
        canonicalRow,
      decision
    };
  }

  const next = {
    ...canonicalRow,

    // Primary state is normalized to an unambiguous played-terminal token.
    // Secondary provider fields are preserved below for provenance only.
    status:
      normalizedPrimaryTerminalStatus(
        observationRow
      ),

    statusType:
      observationRow?.statusType ||
      "STATUS_FINAL",

    rawStatus:
      observationRow?.rawStatus ||
      "STATUS_FULL_TIME",

    operationalState:
      observationRow
        ?.operationalState ||
      "TERMINAL_CONFIRMED",

    minute:
      observationRow?.minute ||
      "FT",

    scoreHome:
      decision.scoreHome,

    scoreAway:
      decision.scoreAway,

    penalties:
      observationRow?.penalties ??
      canonicalRow?.penalties ??
      null,

    decidedBy:
      observationRow?.decidedBy ??
      canonicalRow?.decidedBy ??
      null,

    lastSeenAt:
      observationRow?.lastSeenAt ||
      promotedAt,

    authoritativeTerminalWriteback: {
      schema:
        "ai-matchlab.authoritative-terminal-writeback.v1",

      promotedAt,

      provider:
        clean(
          observationRow?.source
        ) || null,

      providerMatchId:
        decision.providerMatchId,

      dayKey:
        decision.dayKey,

      identityContract: {
        exactProviderId: true,
        athensDay: true,
        orderedTeamPair: true,
        explicitTerminalStatus: true,
        numericScore: true,
        heuristicIdentity: false
      },

      observation: {
        status:
          observationRow?.status ??
          null,

        statusType:
          observationRow?.statusType ??
          null,

        rawStatus:
          observationRow?.rawStatus ??
          null,

        scoreHome:
          decision.scoreHome,

        scoreAway:
          decision.scoreAway
      }
    }
  };

  const before =
    JSON.stringify({
      status:
        canonicalRow?.status ?? null,
      statusType:
        canonicalRow?.statusType ?? null,
      rawStatus:
        canonicalRow?.rawStatus ?? null,
      scoreHome:
        canonicalRow?.scoreHome ?? null,
      scoreAway:
        canonicalRow?.scoreAway ?? null
    });

  const after =
    JSON.stringify({
      status:
        next?.status ?? null,
      statusType:
        next?.statusType ?? null,
      rawStatus:
        next?.rawStatus ?? null,
      scoreHome:
        next?.scoreHome ?? null,
      scoreAway:
        next?.scoreAway ?? null
    });

  return {
    changed:
      before !== after,
    row:
      next,
    decision
  };
}
