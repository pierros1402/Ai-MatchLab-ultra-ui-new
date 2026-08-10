import test from "node:test";
import assert from "node:assert/strict";
import { isUsableModelPriorRow } from "./build-model-priors.js";

test("model priors accept only conflict-free played finals with explicit integer scores", () => {
  assert.equal(isUsableModelPriorRow({ status: "FT", scoreHome: 2, scoreAway: 1 }), true);
  assert.equal(isUsableModelPriorRow({ status: "STATUS_FINAL", scoreHome: "0", scoreAway: "0" }), true);
  assert.equal(isUsableModelPriorRow({ status: "STATUS_SCHEDULED", statusType: "FINAL", scoreHome: 0, scoreAway: 0 }), false);
  assert.equal(isUsableModelPriorRow({ status: "FT", scoreHome: null, scoreAway: 0 }), false);
  assert.equal(isUsableModelPriorRow({ status: "FT", scoreHome: "", scoreAway: 0 }), false);
  assert.equal(isUsableModelPriorRow({ status: "FT", scoreHome: -1, scoreAway: 0 }), false);
});
