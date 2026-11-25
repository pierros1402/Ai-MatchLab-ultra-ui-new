import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveResearchCompetition, resolveSlugFromPath } from './flashscore-league-map.js';

test('Conference research requires matching native stage labels without broadening day-feed routing', () => {
  for (const leaguePath of ['/football/europe/conference-league/', '/football/europe/europa-conference-league/']) {
    for (const leagueName of ['Conference League - League phase', 'EUROPE: Conference League - Qualification']) {
      // The feed parser removes the country prefix before competition resolution.
      const label = leagueName.replace('EUROPE: ', '');
      assert.equal(resolveResearchCompetition({ leaguePath, leagueName: label }), label.includes('Qualification') ? 'uecl.q' : 'uefa.europa.conf');
    }
    for (const leagueName of ['', 'Europa League - League phase', 'Conference League - Unknown']) {
      assert.equal(resolveResearchCompetition({ leaguePath, leagueName }), null);
    }
  }
  assert.equal(resolveSlugFromPath('/football/europe/conference-league/'), null);
  assert.equal(resolveResearchCompetition({ leaguePath: '/football/europe/europa-conference-league-qualification/', leagueName: 'Conference League - League phase' }), null);
  assert.equal(resolveResearchCompetition({ leaguePath: '/football/tanzania/ligi-kuu-bara/', leagueName: 'Ligi Kuu Bara' }), null);
});

import { resolveInternational } from './international-competitions.js';
import { resolveFlashscoreCompetitionIdentity } from '../core/flashscore-competition-identity.js';

test('international routing refuses explicit non-senior competitions before generic cup mapping', () => {
  for (const marker of ['U17','U-17','U 17','Under-17','Under 20','U19','U21','U23','Youth','Junior','Development','Women','Reserve']) {
    assert.equal(resolveInternational('World Cup '+marker,'World'),null,marker);
    assert.equal(resolveInternational('World Cup','World','/football/world/world-cup-'+marker+'/'),null,marker);
    assert.equal(resolveFlashscoreCompetitionIdentity({country:'World',leagueName:'World Cup '+marker}).canonicalSlug,null,marker);
  }
  assert.equal(resolveInternational('World Cup','World').slug,'fifa.world');
  assert.equal(resolveInternational('World Cup Qualification','World').slug,'fifa.world_cup_qual');
  assert.equal(resolveInternational('Champions League Qualifying','Europe').slug,'uefa.champions_qual');
});
