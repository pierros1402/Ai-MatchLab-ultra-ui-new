import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeTeamTokens,
  normalizeTeamKey
} from "../core/normalize.js";

import {
  buildCanonicalId
} from "../core/canonical-id.js";

test(
  "standalone AFC retains a non-empty canonical identity token",
  () => {
    assert.equal(
      normalizeTeamTokens("AFC"),
      "afc"
    );

    assert.equal(
      normalizeTeamKey("AFC"),
      "afc"
    );

    assert.equal(
      buildCanonicalId(
        "ned.cup",
        "Be Quick 1887",
        "AFC",
        "2026-09-01"
      ),
      "cid_nedcup_bequick1887_afc_20260901"
    );
  }
);

test(
  "normal football affix stripping remains unchanged",
  () => {
    assert.equal(
      normalizeTeamKey("FC Lisse"),
      "lisse"
    );

    assert.equal(
      normalizeTeamKey("SC Genemuiden"),
      "genemuiden"
    );

    assert.equal(
      normalizeTeamKey("AFC '34"),
      "34"
    );

    assert.equal(
      normalizeTeamKey("AFC Wimbledon"),
      "wimbledon"
    );
  }
);
