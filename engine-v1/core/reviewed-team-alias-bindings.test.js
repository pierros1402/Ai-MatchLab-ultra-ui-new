import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {getProductionIdentityResolver} from './production-identity-resolver-runtime.js';
import {loadReviewedTeamAliasBindings} from './reviewed-team-alias-bindings.js';
import {getProjectRoot} from '../storage/data-root.js';

test('reviewed Cologne alias preserves its established ID and fails closed on conflicting signals or league',()=>{
 const r=getProductionIdentityResolver(),id='gcid_557de2d747e597bbf4be66fe';
 assert.equal(r.resolveTeamReference({alias:'1. FC Köln',leagueSlug:'ger.1',globalClubId:id}).globalClubId,id);
 assert.equal(r.resolveTeamReference({alias:'FC Koln',leagueSlug:'ger.1'}).globalClubId,id);
 assert.equal(r.resolveTeamReference({alias:'1. FC Köln',leagueSlug:'eng.1'}).ok,false);
 assert.equal(r.resolveTeamReference({alias:'1. FC Köln',leagueSlug:'ger.1',globalClubId:'gcid_unknown'}).ok,false);
 assert.equal(r.resolveTeamReference({alias:'1. FC Koln II',leagueSlug:'ger.1'}).ok,false);
});
test('reviewed alias requires byte-bound source evidence and exact group membership',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'aiml-alias-binding-'));
 try{
  fs.mkdirSync(path.join(root,'data/identity-decisions'),{recursive:true});fs.mkdirSync(path.join(root,'data/team-aliases'),{recursive:true});
  for(const rel of ['data/team-aliases/ger.1.json','data/identity-decisions/production-reviewed-team-aliases.v1.json'])fs.copyFileSync(path.join(getProjectRoot(),rel),path.join(root,rel));
  assert.equal(loadReviewedTeamAliasBindings(root).length,1);
  fs.appendFileSync(path.join(root,'data/team-aliases/ger.1.json'),' ');
  assert.throws(()=>loadReviewedTeamAliasBindings(root),/SOURCE_HASH_MISMATCH/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
