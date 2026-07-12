import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAcquisitionSkippedSlugsWarning,
  filterActionableSkippedSlugs,
  parseAcquisitionSkippedSlugs,
  skippedSlugsContextOnly
} from "./skipped-slug-policy.js";

test("context-only skipped slugs do not produce actionable build warnings", () => {
  const raw = "acquisition_skipped_slugs:usa.nwsl,club.friendly,usa.usl.l1.cup,can.w.nsl,uefa.euro.u19,chi.copa_chi,arg.copa";
  const slugs = parseAcquisitionSkippedSlugs(raw);

  assert.equal(skippedSlugsContextOnly(slugs), true);
  assert.deepEqual(filterActionableSkippedSlugs(slugs), []);
  assert.equal(buildAcquisitionSkippedSlugsWarning(slugs), null);
});

test("supported-competition alias drifts stay actionable", () => {
  const raw = "acquisition_skipped_slugs:usa.nwsl,sco.cis";
  const slugs = parseAcquisitionSkippedSlugs(raw);

  assert.equal(skippedSlugsContextOnly(slugs), false);
  assert.deepEqual(filterActionableSkippedSlugs(slugs), ["sco.cis"]);
  assert.equal(buildAcquisitionSkippedSlugsWarning(slugs), "acquisition_skipped_slugs:sco.cis");
});
