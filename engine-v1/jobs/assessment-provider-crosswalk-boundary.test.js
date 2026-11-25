import test from 'node:test';
import assert from 'node:assert/strict';
import {crossFormIdentityOptions} from './canonical-assessment-supplement.js';
import {buildProviderTeamCrosswalk} from '../core/provider-team-crosswalk.js';
const id='gcid_aaaaaaaaaaaaaaaaaaaaaaaa';
const c=buildProviderTeamCrosswalk({entries:[{provider:'espn',teamId:'123',globalClubId:id,evidenceRef:'synthetic',reviewStatus:'APPROVED'}],resolveApprovedClub:x=>({ok:x===id,globalClubId:x})});
const f={providerTeamIds:{espn:{home:'123',away:'456'}}};
test('reviewed provider evidence and conflict veto',()=>{
 assert.equal(crossFormIdentityOptions(f,'home',1,c).expectedGlobalClubId,id);
 assert.equal(crossFormIdentityOptions(f,'away',1,c).expectedGlobalClubId,null);
 assert.equal(crossFormIdentityOptions({...f,homeGlobalClubId:id},'home',1,c).identityConflict,false);
 assert.equal(crossFormIdentityOptions({...f,homeGlobalClubId:'other'},'home',1,c).identityConflict,true);
 assert.equal(crossFormIdentityOptions({...f,providerTeamIdentityConflict:true},'home',1,c).identityConflict,true);
 assert.equal(crossFormIdentityOptions(f,'home',1).expectedGlobalClubId,null);
});
