import { athensDayFromKickoff } from "./daykey.js";

export const PROVIDER_FIXTURE_IDENTITY_SCHEMA =
  "ai-matchlab.provider-fixture-identity.v1";

const text = value => value == null ? null : String(value).trim() || null;
const iso = value => Number.isFinite(Date.parse(value))
  ? new Date(value).toISOString() : null;

// Preserve every observation, including duplicate IDs and excluded rows.
// Discovery cannot invent a canonical or provider team binding from a name.
export function providerFixtureIdentity(row, competition, targetDay) {
  const kickoffUtc = iso(row?.kickoffUtc);
  const dayKey = kickoffUtc ? athensDayFromKickoff(kickoffUtc) : null;
  const providerFixtureId = text(row?.matchId ?? row?.sourceId ?? row?.id);
  const nonPlayedTerminal = row?.nonPlayedTerminal === true;
  const eligible = competition.acquisitionEligible === true &&
    dayKey === targetDay && !nonPlayedTerminal;
  const exclusionReason = dayKey !== targetDay
    ? (dayKey ? "outside_target_day" : "kickoff_missing")
    : nonPlayedTerminal ? "non_played_terminal"
      : !competition.acquisitionEligible ? competition.reasonCode : null;
  return {
    schema: PROVIDER_FIXTURE_IDENTITY_SCHEMA,
    provider: "flashscore",
    providerFixtureId,
    providerCompetitionId: text(competition.providerCompetitionId),
    canonicalSlug: text(competition.canonicalSlug),
    dayKey,
    kickoffUtc,
    home: { providerTeamId: text(row?.homeProviderTeamId), name: text(row?.home) },
    away: { providerTeamId: text(row?.awayProviderTeamId), name: text(row?.away) },
    providerStatus: text(row?.statusCode),
    providerStatusDetail: text(row?.statusDetailCode),
    nonPlayedTerminal,
    eligibility: eligible ? "eligible" : "excluded",
    exclusionReason,
    canonicalFixtureId: null,
    identityComplete: Boolean(providerFixtureId && kickoffUtc &&
      text(row?.home) && text(row?.away))
  };
}
