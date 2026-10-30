import test from "node:test";
import assert from "node:assert/strict";
import {classifyAliasReference} from "./inventory-canonical-alias-references.js";
test("legacy canonical migration preserves immutable and Value truth",()=>{
 for(const file of ["data/final-results/2026-10-29/cid.json",
 "data/day-truth-ledger/2026-10-29.json",
 "data/value-plans/2026-10-29/plan-b.json",
 "data/value-unified/2026-10-29/observations/test.json"])
 assert.equal(classifyAliasReference(file),"PRESERVE_IMMUTABLE_OR_SETTLEMENT");
});
test("canonical authority and derived snapshots have distinct migration gates",()=>{
 assert.equal(classifyAliasReference("data/canonical-fixtures/2026-10-29/afc.cup.json"),"CANONICAL_IDENTITY_AUTHORITY");
 assert.equal(classifyAliasReference("data/deploy-snapshots/2026-10-29/fixtures.json"),"REBUILD_DERIVED_SNAPSHOT");
 assert.equal(classifyAliasReference("data/team-news/_reports/2026-10-29.json"),"REVIEW_OTHER_REFERENCES");
});
