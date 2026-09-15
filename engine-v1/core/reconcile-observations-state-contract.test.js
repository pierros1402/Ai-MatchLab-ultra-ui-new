import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyReconciledStatusSemantics
} from "./reconcile-observations.js";

import {
  OPERATIONAL_MATCH_STATE
} from "./non-played-state.js";

test(
  "reconcile classifier cannot mistake SUSPENDED for PEN",
  () => {
    assert.equal(
      classifyReconciledStatusSemantics(
        "SUSPENDED"
      ),
      OPERATIONAL_MATCH_STATE
        .INTERRUPTED
    );
  }
);

test(
  "reconcile classifier preserves delayed truth over generic LIVE",
  () => {
    assert.equal(
      classifyReconciledStatusSemantics(
        "LIVE",
        "STATUS_DELAYED"
      ),
      OPERATIONAL_MATCH_STATE
        .DELAYED
    );
  }
);

test(
  "reconcile classifier fails closed on played versus postponed conflict",
  () => {
    assert.equal(
      classifyReconciledStatusSemantics(
        "FT",
        "STATUS_POSTPONED"
      ),
      OPERATIONAL_MATCH_STATE
        .CONFLICT
    );
  }
);

test(
  "generic SPECIAL remains unresolved without a concrete reason",
  () => {
    assert.equal(
      classifyReconciledStatusSemantics(
        "SPECIAL"
      ),
      OPERATIONAL_MATCH_STATE
        .UNRESOLVED
    );
  }
);

test(
  "explicit penalty final remains played-terminal",
  () => {
    assert.equal(
      classifyReconciledStatusSemantics(
        "FT",
        "STATUS_FINAL_PEN"
      ),
      OPERATIONAL_MATCH_STATE
        .PLAYED_TERMINAL
    );
  }
);

test(
  "generic terminal-confirmed marker alone is unresolved",
  () => {
    assert.equal(
      classifyReconciledStatusSemantics(
        {
          operationalState:
            "TERMINAL_CONFIRMED"
        }
      ),
      OPERATIONAL_MATCH_STATE
        .UNRESOLVED
    );
  }
);
