/**
 * Provider-native Flashscore fixture-round acquisition.
 *
 * The day feed exposes tournamentId/stageId but not the fixture round.
 * The desktop match page contains match-specific competition labels in:
 *
 * 1. the og:description meta element;
 * 2. structured header.tournament.tournament metadata.
 *
 * A numeric round is accepted only when both sources agree.
 * Expected tournament and stage identities must also be present.
 *
 * There is intentionally no standings-derived or sequential fallback.
 */

const DEFAULT_TIMEOUT_MS = 20_000;

function cleanText(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return String(value || "")
    .replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
}

function firstMatch(text, pattern) {
  const match = String(text || "").match(pattern);
  return match ? cleanText(match[1]) : null;
}

function parseNumericRound(label) {
  const text = cleanText(label);

  const match = text.match(
    /(?:^|\s|[-–—:])round\s+(\d{1,3})(?:\s|$|[-–—:])/i
  );

  if (!match) {
    return null;
  }

  const roundNumber = Number(match[1]);

  return (
    Number.isInteger(roundNumber) &&
    roundNumber >= 1 &&
    roundNumber <= 100
  )
    ? roundNumber
    : null;
}

function extractOgDescription(html) {
  return firstMatch(
    html,
    /<meta\b(?=[^>]*\bproperty=["']og:description["'])(?=[^>]*\bcontent=["']([^"']*)["'])[^>]*>/i
  );
}

function extractStructuredTournamentLabel(html) {
  const matches = [
    ...String(html || "").matchAll(
      /"tournament"\s*:\s*"((?:\\.|[^"\\])*)"/g
    )
  ];

  for (const match of matches) {
    const value = cleanText(
      match[1]
        .replace(/\\"/g, '"')
        .replace(/\\\//g, "/")
        .replace(/\\\\/g, "\\")
    );

    if (/\bround\s+\d{1,3}\b/i.test(value)) {
      return value;
    }
  }

  return null;
}

function htmlContainsExactMetadataId(
  html,
  field,
  expectedValue
) {
  const expected = String(expectedValue || "").trim();

  if (!expected) {
    return true;
  }

  const pattern = new RegExp(
    '"' +
      escapeRegExp(field) +
      '"\\s*:\\s*"' +
      escapeRegExp(expected) +
      '"'
  );

  return pattern.test(String(html || ""));
}

export function parseFlashscoreMatchRoundHtml(
  html,
  {
    matchId = null,
    tournamentId = null,
    stageId = null
  } = {}
) {
  const text = String(html || "");

  if (!text.trim()) {
    return {
      status: "empty",
      verified: false,
      reason: "empty_html",
      matchId: matchId || null,
      tournamentId: tournamentId || null,
      stageId: stageId || null,
      roundNumber: null,
      roundLabel: null
    };
  }

  const tournamentMatched =
    htmlContainsExactMetadataId(
      text,
      "tournament",
      tournamentId
    );

  const stageMatched =
    htmlContainsExactMetadataId(
      text,
      "tournamentStage",
      stageId
    );

  if (!tournamentMatched || !stageMatched) {
    return {
      status: "gated",
      verified: false,
      reason: !tournamentMatched
        ? "tournament_id_mismatch"
        : "stage_id_mismatch",
      matchId: matchId || null,
      tournamentId: tournamentId || null,
      stageId: stageId || null,
      roundNumber: null,
      roundLabel: null
    };
  }

  const ogDescription =
    extractOgDescription(text);

  const structuredTournamentLabel =
    extractStructuredTournamentLabel(text);

  const ogRound =
    parseNumericRound(ogDescription);

  const structuredRound =
    parseNumericRound(structuredTournamentLabel);

  if (
    ogRound === null &&
    structuredRound === null
  ) {
    return {
      status: "empty",
      verified: false,
      reason: "provider_round_absent",
      matchId: matchId || null,
      tournamentId: tournamentId || null,
      stageId: stageId || null,
      roundNumber: null,
      roundLabel: null,
      evidence: {
        ogDescription,
        structuredTournamentLabel
      }
    };
  }

  if (
    ogRound === null ||
    structuredRound === null ||
    ogRound !== structuredRound
  ) {
    return {
      status: "gated",
      verified: false,
      reason: "provider_round_evidence_mismatch",
      matchId: matchId || null,
      tournamentId: tournamentId || null,
      stageId: stageId || null,
      roundNumber: null,
      roundLabel: null,
      evidence: {
        ogDescription,
        structuredTournamentLabel,
        ogRound,
        structuredRound
      }
    };
  }

  return {
    status: "ready",
    verified: true,
    source: "flashscore_match_page",
    matchId: matchId || null,
    tournamentId: tournamentId || null,
    stageId: stageId || null,
    roundNumber: ogRound,
    roundLabel: "Round " + ogRound,
    evidence: {
      ogDescription,
      structuredTournamentLabel,
      ogRound,
      structuredRound
    }
  };
}

export async function fetchFlashscoreMatchRound(
  matchId,
  {
    tournamentId = null,
    stageId = null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = globalThis.fetch
  } = {}
) {
  const id = String(matchId || "").trim();

  if (!id) {
    return {
      status: "empty",
      verified: false,
      reason: "missing_match_id",
      matchId: null,
      tournamentId,
      stageId,
      roundNumber: null,
      roundLabel: null
    };
  }

  if (typeof fetchImpl !== "function") {
    return {
      status: "error",
      verified: false,
      reason: "fetch_unavailable",
      matchId: id,
      tournamentId,
      stageId,
      roundNumber: null,
      roundLabel: null
    };
  }

  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    Number(timeoutMs) > 0
      ? Number(timeoutMs)
      : DEFAULT_TIMEOUT_MS
  );

  const url =
    "https://www.flashscore.com/match/" +
    encodeURIComponent(id) +
    "/";

  try {
    const response = await fetchImpl(
      url,
      {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/150 Safari/537.36",
          accept:
            "text/html,application/xhtml+xml," +
            "application/json,text/plain,*/*",
          "accept-language":
            "en-US,en;q=0.9"
        }
      }
    );

    if (!response?.ok) {
      return {
        status: "error",
        verified: false,
        reason: "provider_http_error",
        httpStatus:
          Number(response?.status) || null,
        matchId: id,
        tournamentId,
        stageId,
        roundNumber: null,
        roundLabel: null,
        url
      };
    }

    const html = await response.text();

    return {
      ...parseFlashscoreMatchRoundHtml(
        html,
        {
          matchId: id,
          tournamentId,
          stageId
        }
      ),
      url,
      httpStatus:
        Number(response.status) || 200,
      fetchedAt:
        new Date().toISOString()
    };
  } catch (error) {
    return {
      status: "error",
      verified: false,
      reason:
        error?.name === "AbortError"
          ? "provider_timeout"
          : "provider_fetch_failed",
      error:
        String(
          error?.message ||
          error ||
          "unknown_error"
        ),
      matchId: id,
      tournamentId,
      stageId,
      roundNumber: null,
      roundLabel: null,
      url
    };
  } finally {
    clearTimeout(timer);
  }
}
