import assert from 'node:assert/strict';
import test from 'node:test';
import {isDisabledLeague} from '../source-discovery/disabled-leagues.js';
import {LEAGUE_SEEDS,LEAGUE_ONLY_SEEDS,isLeagueCompetition,getLeagueCoverage} from '../../workers/_shared/leagues-coverage.js';
import {LEAGUE_SEEDS as registrySeeds} from '../../workers/_shared/leagues-registry.js';
test('nonexistent and out-of-scope tiers excluded but historical labels retained',()=>{
 for(const slug of ['lie.1','lie.2','smr.2','can.2','gib.2']){
  assert(isDisabledLeague(slug));assert(!LEAGUE_SEEDS.includes(slug));assert(!LEAGUE_ONLY_SEEDS.includes(slug));assert(!registrySeeds.includes(slug));assert(!isLeagueCompetition(slug));assert(getLeagueCoverage(slug));
 }
 for(const slug of ['smr.1','sui.1','ind.2','can.1','gib.1']){
  assert(!isDisabledLeague(slug));assert(LEAGUE_SEEDS.includes(slug));
 }
 assert.deepEqual(registrySeeds,LEAGUE_SEEDS);
});

import {isNonexistentDomesticLeague,isExcludedDomesticLeague} from '../../workers/_shared/nonexistent-domestic-leagues.js';
test('scope exclusion is not a nonexistent competition claim',()=>{
 for(const slug of ['can.2','gib.2']){assert(!isNonexistentDomesticLeague(slug));assert(isExcludedDomesticLeague(slug));}
});
