import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { publicationGuardFile, publicationReadLeaseDir, PUBLICATION_GUARD_SCHEMA } from './runtime-publication-guard.js';

// Read-only. Never recover, delete or authorize publication from this evidence.
const isDay = x => /^\d{4}-\d{2}-\d{2}$/.test(String(x || ''));
const isSha = x => /^[0-9a-f]{64}$/i.test(String(x || ''));
const isRef = x => /^[0-9a-f]{40}$/i.test(String(x || ''));
function readJson(file) {
  try { return { state: 'present', value: JSON.parse(fs.readFileSync(file, 'utf8')) }; }
  catch (e) { return { state: e?.code === 'ENOENT' ? 'missing' : 'unreadable' }; }
}
function listLeases(dir) {
  try { const names = fs.readdirSync(dir); return { state: 'present', count: names.length }; }
  catch (e) { return e?.code === 'ENOENT' ? { state: 'missing', count: 0 } : { state: 'unreadable', count: null }; }
}
function safeMarker(marker) {
  return marker && marker.schema === PUBLICATION_GUARD_SCHEMA &&
    /^[0-9a-f-]{36}$/i.test(String(marker.token || '')) &&
    isDay(marker.day) && isRef(marker.ref) &&
    ['snapshot', 'settlement', 'plan-c-shadow'].includes(marker.mode) &&
    (marker.mode === 'snapshot'
      ? isSha(marker.manifestHash)
      : marker.mode === 'plan-c-shadow'
        ? marker.manifestHash == null
        : true);
}

function inspectShadowFile(file) {
  try {
    const bytes=fs.readFileSync(file);
    const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
    try {
      return {state:'present',sha256,value:JSON.parse(bytes.toString('utf8'))};
    } catch {
      return {state:'unreadable',sha256:null,value:null};
    }
  } catch(error) {
    return {state:error?.code==='ENOENT'?'missing':'unreadable',sha256:null,value:null};
  }
}

function inspectShadowDirectories(root,day) {
  try {
    const names=fs.readdirSync(root);
    return {
      state:'present',
      backupCandidates:names.filter(x=>x.startsWith('.backup-'+day+'-')).sort(),
      stageCandidates:names.filter(x=>x.startsWith('.stage-'+day+'-')).sort()
    };
  } catch(error) {
    return {
      state:error?.code==='ENOENT'?'missing':'unreadable',
      backupCandidates:[],stageCandidates:[]
    };
  }
}

export function inspectPublicationRecovery(dataRoot) {
  if (typeof dataRoot !== 'string' || !path.isAbsolute(dataRoot)) throw new Error('recovery_data_root_absolute_required');
  const markerRead = readJson(publicationGuardFile(dataRoot));
  const leases = listLeases(publicationReadLeaseDir(dataRoot));
  const report = { schema: 'aiml.runtime-publication-recovery-audit.v1', readOnly: true, autoClearAuthorized: false,
    markerState: markerRead.state, leases, decision: 'HOLD', reasons: [] };
  if (markerRead.state === 'missing') {
    report.decision = leases.state === 'unreadable' || leases.count > 0 ? 'HOLD' : 'NO_MARKER_OBSERVED';
    report.reasons.push(leases.count > 0 ? 'orphan_leases_present' : leases.state === 'unreadable' ? 'leases_unreadable' : 'no_publication_marker');
    return report;
  }
  if (markerRead.state !== 'present' || !safeMarker(markerRead.value)) {
    report.reasons.push('publication_marker_untrusted');
    return report;
  }
  const m = markerRead.value;
  report.day = m.day; report.mode = m.mode; report.ref = m.ref; report.manifestHash = m.manifestHash || null;
  if (leases.state === 'unreadable') report.reasons.push('leases_unreadable');
  else if (leases.count > 0) report.reasons.push('leases_not_drained');

  if (m.mode === 'plan-c-shadow') {
    const base=path.join(dataRoot,'runtime-releases','plan-c-shadow');
    const dir=path.join(base,m.day);
    const payload=inspectShadowFile(path.join(dir,'plan-c-shadow.json'));
    const audit=inspectShadowFile(path.join(dir,'plan-c-shadow-audit.json'));
    const release=inspectShadowFile(path.join(dir,'release.json'));
    const directories=inspectShadowDirectories(base,m.day);
    const a=audit.value, r=release.value;

    const releaseBindingMatches=Boolean(
      r?.schema==='ai-matchlab.plan-c-shadow-runtime-release.v1' &&
      r?.ok===true && r?.mode==='SHADOW' &&
      r?.productionEligible===false && r?.date===m.day &&
      r?.ref===m.ref && isSha(r?.payloadSha256) &&
      isSha(r?.auditSha256) && r.payloadSha256===payload.sha256 &&
      r.auditSha256===audit.sha256
    );
    const auditBindingMatches=Boolean(
      a?.schema==='ai-matchlab.plan-c-shadow-build-audit.v1' &&
      a?.ok===true && a?.date===m.day &&
      a?.productionEligible===false && a?.outputSha256===payload.sha256 &&
      Number.isInteger(a?.count) && Number.isInteger(a?.pickCount) &&
      r?.count===a.count && r?.pickCount===a.pickCount
    );

    report.artifacts={
      payload:payload.state,audit:audit.state,release:release.state,
      releaseBindingMatches,auditBindingMatches,directories
    };

    if(!releaseBindingMatches) report.reasons.push('shadow_release_binding_unproven');
    if(!auditBindingMatches) report.reasons.push('shadow_audit_binding_unproven');
    if(directories.state==='unreadable') report.reasons.push('shadow_directories_unreadable');
    if(directories.backupCandidates.length) report.reasons.push('shadow_backup_evidence_present');
    if(directories.stageCandidates.length) report.reasons.push('shadow_stage_evidence_present');
    report.reasons.push('shadow_full_publication_not_proven');
    report.reasons.push('operator_recovery_required');
    return report;
  }

  if (m.mode === 'settlement') {
    const embedded = readJson(path.join(dataRoot, 'deploy-snapshots', m.day, 'runtime', 'value-comparison.json'));
    const mirror = readJson(path.join(dataRoot, 'value-comparison', `${m.day}.json`));
    report.artifacts = { embedded: embedded.state, mirror: mirror.state };
    report.reasons.push('settlement_consistency_not_proven');
    return report;
  }
  const manifestRead = readJson(path.join(dataRoot, 'deploy-snapshots', m.day, 'manifest.json'));
  const stateRead = readJson(path.join(dataRoot, 'deploy-snapshots', 'runtime-sync-state.json'));
  const latestRead = readJson(path.join(dataRoot, 'deploy-snapshots', 'latest.json'));
  const manifest = manifestRead.value;
  const witness = stateRead.value?.days?.[m.day];
  const manifestMatches = manifestRead.state === 'present' && manifest?.hash === m.manifestHash;
  const witnessMatches = stateRead.state === 'present' && witness?.manifestHash === m.manifestHash && witness?.ref === m.ref;
  report.artifacts = { manifest: manifestRead.state, runtimeSyncState: stateRead.state, latest: latestRead.state,
    manifestMatches: Boolean(manifestMatches), witnessMatches: Boolean(witnessMatches) };
  if (!manifestMatches) report.reasons.push('manifest_missing_or_mismatch');
  if (!witnessMatches) report.reasons.push('sync_witness_missing_or_mismatch');
  if (manifestMatches && witnessMatches && leases.count === 0 && leases.state !== 'unreadable') {
    report.reasons.push('metadata_coherent_but_full_publication_not_proven');
  }
  report.reasons.push('operator_recovery_required');
  return report;
}
