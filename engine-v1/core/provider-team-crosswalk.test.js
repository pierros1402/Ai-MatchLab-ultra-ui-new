import test from 'node:test';
import assert from 'node:assert/strict';
import {buildProviderTeamCrosswalk} from './provider-team-crosswalk.js';
const id='gcid_aaaaaaaaaaaaaaaaaaaaaaaa';
const row={provider:'espn',teamId:'123',globalClubId:id,evidenceRef:'synthetic-test-only',reviewStatus:'APPROVED'};
const resolveApprovedClub=x=>({ok:x===id,globalClubId:x});
const build=entries=>buildProviderTeamCrosswalk({entries,resolveApprovedClub});
test('exact reviewed provider mapping only',()=>{
 const c=build([row]);
 assert.equal(c.resolve({provider:'espn',teamId:'123'}).globalClubId,id);
 for(const ref of [{provider:'other',teamId:'123'},{provider:'espn',teamId:'124'},{provider:'espn',teamId:123},{provider:'espn',teamId:'0123'},{provider:'espn',teamId:'123',conflicted:true},{provider:'espn',teamId:'123',expectedGlobalClubId:'other'}]) assert.equal(c.resolve(ref).ok,false);
 assert.equal(build([]).resolve(row).ok,false);
});
test('reject duplicate, unapproved, missing evidence and unknown club',()=>{
 for(const rows of [[row,row],[{...row,reviewStatus:'PENDING'}],[{...row,evidenceRef:''}],[{...row,globalClubId:'gcid_bbbbbbbbbbbbbbbbbbbbbbbb'}]]) assert.throws(()=>build(rows));
});
