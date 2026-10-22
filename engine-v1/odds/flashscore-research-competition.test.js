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
