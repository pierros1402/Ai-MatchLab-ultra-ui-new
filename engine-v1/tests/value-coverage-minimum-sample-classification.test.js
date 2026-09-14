import test from "node:test";
import assert from "node:assert/strict";
import { classifyMinimumSample } from "../jobs/build-value-coverage-report-day.js";
test("raw current-season sample gate drives coverage classification",()=>assert.equal(classifyMinimumSample({minRequiredRecentMatches:3,homeRawSample:2,awayRawSample:3,homeBlendedSample:5,awayBlendedSample:6,homePriorSample:166,awayPriorSample:159}),"low_recent_sample_prior_backed"));
test("blended samples cannot hide raw shortfall",()=>assert.equal(classifyMinimumSample({minRequiredRecentMatches:3,homeRawSample:2,awayRawSample:3,homeBlendedSample:8,awayBlendedSample:9,homePriorSample:0,awayPriorSample:0}),"low_recent_sample"));
test("missing raw history remains explicit",()=>{
  assert.equal(classifyMinimumSample({minRequiredRecentMatches:3,homeRawSample:0,awayRawSample:0,homeBlendedSample:0,awayBlendedSample:0,homePriorSample:0,awayPriorSample:0}),"missing_both_team_history_and_priors");
  assert.equal(classifyMinimumSample({minRequiredRecentMatches:3,homeRawSample:0,awayRawSample:4,homeBlendedSample:0,awayBlendedSample:4,homePriorSample:0,awayPriorSample:0}),"missing_team_history_and_prior");
});
test("satisfied raw gate uses fallback only outside real minimum-sample nulls",()=>assert.equal(classifyMinimumSample({minRequiredRecentMatches:3,homeRawSample:3,awayRawSample:3,homeBlendedSample:3,awayBlendedSample:3,homePriorSample:0,awayPriorSample:0}),"unknown_minimum_sample_null"));
