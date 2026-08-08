import test from "node:test";
import assert from "node:assert/strict";

import { fetchIdentityConfirmationFixturesSource2 } from "./source2.js";

test("identity-only API-Football adapter reports missing credentials as retryable", async () => {
  const result = await fetchIdentityConfirmationFixturesSource2("eng.1", "2026-08-08", {
    apiKey: "",
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "MISSING_API_KEY");
  assert.equal(result.retryable, true);
  assert.equal(result.oddsRequested, false);
});

test("identity-only adapter requests fixtures with Athens day and strips all odds data", async () => {
  let requestedUrl = "";
  let requestedHeaders = null;
  const result = await fetchIdentityConfirmationFixturesSource2("eng.1", "2026-08-08", {
    apiKey: "test-key",
    fetchImpl: async (url, options) => {
      requestedUrl = String(url);
      requestedHeaders = options.headers;
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            errors: [],
            response: [{
              fixture: { id: 12345, date: "2026-08-08T18:45:00+03:00" },
              league: { id: 39, name: "Premier League", country: "England", season: 2026, round: "Round 1" },
              teams: {
                home: { id: 10, name: "Alpha FC" },
                away: { id: 20, name: "Beta FC" },
              },
              odds: [{ bookmaker: "must-not-leak" }],
            }],
          };
        },
      };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.oddsRequested, false);
  assert.match(requestedUrl, /\/fixtures\?date=2026-08-08/u);
  assert.match(requestedUrl, /league=39/u);
  assert.match(requestedUrl, /timezone=Europe%2FAthens/u);
  assert.doesNotMatch(requestedUrl, /odds|bookmaker|predictions/u);
  assert.deepEqual(requestedHeaders, { "x-apisports-key": "test-key" });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].providerMatchId, "12345");
  assert.equal(Object.hasOwn(result.rows[0], "odds"), false);
  assert.equal(result.rows[0].oddsRequested, false);
});
