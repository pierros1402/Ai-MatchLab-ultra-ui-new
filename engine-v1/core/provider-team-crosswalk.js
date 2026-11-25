import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

// Exact, reviewed provider crosswalk. No name inference or identity allocation.
export function buildProviderTeamCrosswalk({ entries, resolveApprovedClub }) {
  if (!Array.isArray(entries) || typeof resolveApprovedClub !== 'function') throw new Error('invalid_crosswalk_contract');
  const index = new Map();
  const validProvider = v => typeof v === 'string' && /^[a-z][a-z0-9-]*$/.test(v);
  const validId = v => typeof v === 'string' && /^[1-9][0-9]*$/.test(v);
  for (const row of entries) {
    if (!row || !validProvider(row.provider) || !validId(row.teamId) ||
        typeof row.globalClubId !== 'string' || !/^gcid_[a-f0-9]{24}$/.test(row.globalClubId) ||
        typeof row.evidenceRef !== 'string' || !row.evidenceRef.trim() ||
        row.reviewStatus !== 'APPROVED') throw new Error('invalid_crosswalk_entry');
    const approved = resolveApprovedClub(row.globalClubId);
    if (!approved?.ok || approved.globalClubId !== row.globalClubId) throw new Error('unknown_crosswalk_club');
    const key = row.provider + ':' + row.teamId;
    if (index.has(key)) throw new Error('duplicate_crosswalk_key');
    index.set(key, Object.freeze({provider:row.provider, teamId:row.teamId, globalClubId:row.globalClubId, evidenceRef:row.evidenceRef}));
  }
  return Object.freeze({
    resolve({provider, teamId, expectedGlobalClubId, conflicted = false} = {}) {
      if (conflicted !== false || !validProvider(provider) || !validId(teamId)) return {ok:false,status:'INVALID_PROVIDER_EVIDENCE'};
      const row = index.get(provider + ':' + teamId);
      if (!row) return {ok:false,status:'UNMAPPED_PROVIDER_TEAM'};
      if (expectedGlobalClubId !== undefined && expectedGlobalClubId !== row.globalClubId) return {ok:false,status:'CONFLICTING_IDENTITY_SIGNALS'};
      return {ok:true,status:'RESOLVED_REVIEWED_PROVIDER_TEAM',...row,productionMutationAuthorized:false};
    }
  });
}

 // Explicit digest is supplied by the reviewed release, never by the ledger itself.
export function loadPinnedProviderTeamCrosswalk({root, relativePath, expectedSha256, resolveApprovedClub}) {
  if (relativePath !== 'data/identity-decisions/production-provider-team-crosswalk.v1.json' ||
      !/^[a-f0-9]{64}$/.test(expectedSha256 || '')) throw Error('provider_crosswalk_pin_required');
  const bytes = fs.readFileSync(path.join(root, relativePath));
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== expectedSha256) throw Error('provider_crosswalk_hash_mismatch');
  const doc = JSON.parse(bytes.toString('utf8'));
  if (doc.schema !== 'ai-matchlab.production-provider-team-crosswalk.v1') throw Error('provider_crosswalk_schema_invalid');
  return buildProviderTeamCrosswalk({entries:doc.entries,resolveApprovedClub});
}
