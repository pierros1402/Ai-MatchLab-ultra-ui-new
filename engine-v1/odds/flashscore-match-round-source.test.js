import test from "node:test";
import assert from "node:assert/strict";

import {
  fetchFlashscoreMatchRound,
  parseFlashscoreMatchRoundHtml
} from "./flashscore-match-round-source.js";

function page({
  description,
  tournamentLabel,
  tournamentId = "pv7V3RRE",
  stageId = "hdLUdQGi"
}) {
  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    '<meta property="og:description" content="' +
      description +
      '">',
    "</head>",
    "<body>",
    "<script>",
    "window.__DATA__ = {",
    '"tournamentStage":"' + stageId + '",',
    '"tournament":"' + tournamentId + '",',
    '"header":{"tournament":{"tournament":"' +
      tournamentLabel +
      '"}}',
    "};",
    "</script>",
    "</body>",
    "</html>"
  ].join("\n");
}

test(
  "accepts a provider round only when both match-specific labels agree",
  () => {
    const result =
      parseFlashscoreMatchRoundHtml(
        page({
          description:
            "BRAZIL: Serie A Betano - Round 21",
          tournamentLabel:
            "Serie A Betano - Round 21"
        }),
        {
          matchId: "dKNS3gge",
          tournamentId: "pv7V3RRE",
          stageId: "hdLUdQGi"
        }
      );

    assert.equal(result.status, "ready");
    assert.equal(result.verified, true);
    assert.equal(result.roundNumber, 21);
    assert.equal(result.roundLabel, "Round 21");
  }
);

test(
  "does not invent a round when the provider omits it",
  () => {
    const result =
      parseFlashscoreMatchRoundHtml(
        page({
          description:
            "CANADA: Canadian Premier League",
          tournamentLabel:
            "Canadian Premier League",
          tournamentId: "nXYZZwNN",
          stageId: "Ms6Fe4w3"
        }),
        {
          matchId: "GrU5mG5N",
          tournamentId: "nXYZZwNN",
          stageId: "Ms6Fe4w3"
        }
      );

    assert.equal(result.status, "empty");
    assert.equal(result.verified, false);
    assert.equal(
      result.reason,
      "provider_round_absent"
    );
    assert.equal(result.roundNumber, null);
  }
);

test(
  "rejects conflicting provider round evidence",
  () => {
    const result =
      parseFlashscoreMatchRoundHtml(
        page({
          description:
            "BRAZIL: Serie B - Round 20",
          tournamentLabel:
            "Serie B - Round 21",
          tournamentId: "tYGti5dR",
          stageId: "lOEwe4o4"
        }),
        {
          matchId: "x81M0LaB",
          tournamentId: "tYGti5dR",
          stageId: "lOEwe4o4"
        }
      );

    assert.equal(result.status, "gated");
    assert.equal(result.verified, false);
    assert.equal(
      result.reason,
      "provider_round_evidence_mismatch"
    );
    assert.equal(result.roundNumber, null);
  }
);

test(
  "rejects a mismatched tournament identity",
  () => {
    const result =
      parseFlashscoreMatchRoundHtml(
        page({
          description:
            "BRAZIL: Serie A Betano - Round 21",
          tournamentLabel:
            "Serie A Betano - Round 21"
        }),
        {
          matchId: "dKNS3gge",
          tournamentId: "wrongTournament",
          stageId: "hdLUdQGi"
        }
      );

    assert.equal(result.status, "gated");
    assert.equal(
      result.reason,
      "tournament_id_mismatch"
    );
  }
);

test(
  "rejects a mismatched stage identity",
  () => {
    const result =
      parseFlashscoreMatchRoundHtml(
        page({
          description:
            "BRAZIL: Serie A Betano - Round 21",
          tournamentLabel:
            "Serie A Betano - Round 21"
        }),
        {
          matchId: "dKNS3gge",
          tournamentId: "pv7V3RRE",
          stageId: "wrongStage"
        }
      );

    assert.equal(result.status, "gated");
    assert.equal(
      result.reason,
      "stage_id_mismatch"
    );
  }
);

test(
  "ignores unrelated translation strings containing round numbers",
  () => {
    const html =
      page({
        description:
          "CANADA: Canadian Premier League",
        tournamentLabel:
          "Canadian Premier League",
        tournamentId: "nXYZZwNN",
        stageId: "Ms6Fe4w3"
      }) +
      [
        "<script>",
        '{"TRANS_GOLF_STATISTICS_ROUND_1":"Round 1",',
        '"TRANS_DEFAULT_MATCH_STATUS_SECOND_ROUND":"Round 2"}',
        "</script>"
      ].join("\n");

    const result =
      parseFlashscoreMatchRoundHtml(
        html,
        {
          matchId: "GrU5mG5N",
          tournamentId: "nXYZZwNN",
          stageId: "Ms6Fe4w3"
        }
      );

    assert.equal(result.status, "empty");
    assert.equal(result.roundNumber, null);
  }
);

test(
  "fetcher parses a successful provider response",
  async () => {
    const fakeFetch =
      async () => ({
        ok: true,
        status: 200,
        async text() {
          return page({
            description:
              "BRAZIL: Serie B - Round 20",
            tournamentLabel:
              "Serie B - Round 20",
            tournamentId: "tYGti5dR",
            stageId: "lOEwe4o4"
          });
        }
      });

    const result =
      await fetchFlashscoreMatchRound(
        "x81M0LaB",
        {
          tournamentId: "tYGti5dR",
          stageId: "lOEwe4o4",
          fetchImpl: fakeFetch
        }
      );

    assert.equal(result.status, "ready");
    assert.equal(result.verified, true);
    assert.equal(result.roundNumber, 20);
    assert.equal(result.httpStatus, 200);
  }
);

test(
  "fetcher fails closed on HTTP errors",
  async () => {
    const result =
      await fetchFlashscoreMatchRound(
        "x81M0LaB",
        {
          tournamentId: "tYGti5dR",
          stageId: "lOEwe4o4",
          fetchImpl:
            async () => ({
              ok: false,
              status: 401
            })
        }
      );

    assert.equal(result.status, "error");
    assert.equal(result.verified, false);
    assert.equal(
      result.reason,
      "provider_http_error"
    );
    assert.equal(result.roundNumber, null);
  }
);
