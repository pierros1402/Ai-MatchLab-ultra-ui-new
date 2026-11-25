import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {loadPinnedProviderTeamCrosswalk} from './provider-team-crosswalk.js';
test('exact release pin required; tampering rejected',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'crosswalk-'));
 try {
 const relativePath='data/identity-decisions/production-provider-team-crosswalk.v1.json';
 const file=path.join(root,relativePath);
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const id='gcid_aaaaaaaaaaaaaaaaaaaaaaaa';
 const bytes=JSON.stringify({schema:'ai-matchlab.production-provider-team-crosswalk.v1',entries:[{provider:'espn',teamId:'123',globalClubId:id,evidenceRef:'synthetic',reviewStatus:'APPROVED'}]});
 fs.writeFileSync(file,bytes);
 const opts={root,relativePath,expectedSha256:crypto.createHash('sha256').update(bytes).digest('hex'),resolveApprovedClub:x=>({ok:x===id,globalClubId:x})};
 assert.equal(loadPinnedProviderTeamCrosswalk(opts).resolve({provider:'espn',teamId:'123'}).globalClubId,id);
 assert.throws(()=>loadPinnedProviderTeamCrosswalk({...opts,expectedSha256:null}),/pin_required/);
 assert.throws(()=>loadPinnedProviderTeamCrosswalk({...opts,relativePath:'other.json'}),/pin_required/);
 fs.appendFileSync(file,' ');
 assert.throws(()=>loadPinnedProviderTeamCrosswalk(opts),/hash_mismatch/);
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});
