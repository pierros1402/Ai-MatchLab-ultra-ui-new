import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function loadReviewedTeamAliasBindings(root){
  const file=path.join(root,'data/identity-decisions/production-reviewed-team-aliases.v1.json');
  if(!fs.existsSync(file))return [];
  const doc=JSON.parse(fs.readFileSync(file,'utf8'));
  if(doc.schema!=='ai-matchlab.reviewed-team-alias-bindings.v1'||doc.policy!=='EXACT_SOURCE_BOUND_ALIAS_EXISTING_GLOBAL_ID_ONLY'||!Array.isArray(doc.bindings))throw Error('REVIEWED_ALIAS_LEDGER_INVALID');
  return doc.bindings.map(b=>{
    if(b.sourcePath!==`data/team-aliases/${b.leagueSlug}.json`||!/^[-a-z0-9_.]+$/.test(b.leagueSlug)||!b.alias||!b.anchorAlias||!b.globalClubId)throw Error('REVIEWED_ALIAS_SOURCE_SCOPE_INVALID');
    const bytes=fs.readFileSync(path.join(root,b.sourcePath));
    if(crypto.createHash('sha256').update(bytes).digest('hex')!==b.sourceSha256)throw Error('REVIEWED_ALIAS_SOURCE_HASH_MISMATCH');
    const group=JSON.parse(bytes)[b.sourceCanonicalName];
    if(!Array.isArray(group)||![b.sourceCanonicalName,...group].includes(b.alias)||![b.sourceCanonicalName,...group].includes(b.anchorAlias))throw Error('REVIEWED_ALIAS_EXACT_GROUP_BINDING_REQUIRED');
    return Object.freeze({...b});
  });
}
