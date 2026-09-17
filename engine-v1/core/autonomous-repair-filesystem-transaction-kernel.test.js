import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  autonomousRepairExecutionTransactionPlanFingerprint
} from "./autonomous-repair-execution-transaction-plan.js";

import {
  buildAutonomousRepairSourceBoundMaterialResolution,
  autonomousRepairProducerContractForClass
} from "./autonomous-repair-source-bound-material-resolver.js";

import {
  AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE,
  autonomousRepairExecutionJournalFingerprint,
  buildAutonomousRepairExecutionPreparedJournal,
  createAutonomousRepairExternalExecutionStateAdapter,
  newAutonomousRepairExecutionTransactionId
} from "./autonomous-repair-external-execution-state.js";

import {
  executeAutonomousRepairFilesystemTransactionSandbox,
  recoverAutonomousRepairFilesystemTransactionSandbox,
  validateAutonomousRepairFilesystemTransactionSandboxRoots
} from "./autonomous-repair-filesystem-transaction-kernel.js";

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function mkSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-7f3c-"));
  const project = path.join(root, "project");
  const state = path.join(root, "state");
  const backup = path.join(root, "backup");
  fs.mkdirSync(project);
  fs.mkdirSync(state);
  fs.mkdirSync(backup);
  return { root, project, state, backup };
}

function cleanup(sandbox) {
  fs.rmSync(sandbox.root, { recursive: true, force: true });
}

function tokenId(prefix, token, length) {
  return `${prefix}${token.repeat(length)}`;
}

const SAFETY = {
  pinnedTrustReverificationRequired: true,
  preimageReverificationRequired: true,
  externalGlobalLockRequired: true,
  atomicReplayConsumeRequired: true,
  durableExternalJournalRequired: true,
  verifiedBackupRequiredForReplace: true,
  fsyncedTempRequired: true,
  postimageVerificationRequired: true,
  reverseRollbackRequired: true,
  crashRecoveryRollbackOnly: true,
  allTargetsAppliedOrVerifiedRestored: true
};

const AUTHORITY = {
  readOnly: true,
  filesystemWriteAuthorized: false,
  repairAuthorized: false,
  executionAuthorized: false,
  rollbackExecutionAuthorized: false,
  replayConsumptionAuthorized: false,
  workflowMutationAuthorized: false
};

function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sourceRefs(token) {
  const raw = Buffer.from(`kernel-source-${token}`, "utf8");
  return [{
    ref: `evidence/kernel-source-${token}.json`,
    sha256: sha256(raw),
    bytes: raw.length
  }];
}

function verifiedFinalPayload({ dayKey, canonicalId, index }) {
  const homeScore = 2 + (index % 2);
  const awayScore = index % 2;
  const scoreKey = `${homeScore}-${awayScore}`;

  return {
    schema: "ai-matchlab.verified-final-result.v1",
    verifiedFinalTruth: true,
    date: dayKey,
    dayKey,
    matchId: canonicalId,
    homeScore,
    awayScore,
    scoreHome: homeScore,
    scoreAway: awayScore,
    finalScore: {
      homeScore,
      awayScore,
      home: homeScore,
      away: awayScore,
      scoreKey
    },
    scoreKey,
    finalTruthVerdict: "verified_final_result",
    verdict: "verified_final_result",
    sourceCount: 1,
    independentSourceCount: 1,
    sources: [{ provider: "flashscore" }],
    verification: {
      verdict: "verified_final_result",
      generatedAt: `${dayKey}T10:00:00.000Z`
    },
    settlement: {
      state: "verified_final_result"
    },
    generatedAt: `${dayKey}T10:00:00.000Z`
  };
}

function buildValidMaterialResolution({ dayKey, specs }) {
  const candidates = [];
  const materializationsByDecisionId = {};
  const targetStatesByDecisionId = {};
  const descriptors = [];

  specs.forEach((spec, index) => {
    const token = ((index + 1) % 10).toString();
    const candidateDecisionId = tokenId("arpd_v1_", token, 24);
    const canonicalId = `cid_kernel_${token}_${dayKey.replaceAll("-", "")}`;
    const targetPath = `data/final-results/${dayKey}/${canonicalId}.json`;
    const postBuffer = canonicalBytes(
      verifiedFinalPayload({
        dayKey,
        canonicalId,
        index
      })
    );

    const candidate = {
      classification: "ELIGIBLE_REPAIR_CANDIDATE",
      policyDecisionId: candidateDecisionId,
      repairClass: "ACQUIRE_VERIFIED_FINAL_EVIDENCE",
      diagnosis: { canonicalId }
    };

    candidates.push(candidate);

    materializationsByDecisionId[candidateDecisionId] = {
      targetPath,
      producer: autonomousRepairProducerContractForClass(
        "ACQUIRE_VERIFIED_FINAL_EVIDENCE"
      ),
      producerProof: {
        builder: "buildVerifiedFinalResult"
      },
      sourceRefs: sourceRefs(token),
      contentBase64: postBuffer.toString("base64")
    };

    const preBuffer =
      spec.mode === "REPLACE"
        ? Buffer.from(spec.pre, "utf8")
        : null;

    targetStatesByDecisionId[candidateDecisionId] = {
      targetExists: spec.mode === "REPLACE",
      currentSha256: preBuffer ? sha256(preBuffer) : null
    };

    descriptors.push({
      candidateDecisionId,
      canonicalId,
      targetPath,
      postBuffer
    });
  });

  const materialResolution =
    buildAutonomousRepairSourceBoundMaterialResolution({
      policy: {
        dayKey,
        policyFingerprint: "a".repeat(64),
        decisions: candidates,
        authority: {
          filesystemWriteAuthorized: false,
          repairAuthorized: false,
          executionAuthorized: false,
          rollbackExecutionAuthorized: false,
          workflowMutationAuthorized: false,
          authorizationGranted: false
        }
      },
      materializationsByDecisionId,
      targetStatesByDecisionId,
      generatedAt: `${dayKey}T12:05:00.000Z`
    });

  return {
    materialResolution,
    descriptors
  };
}

function makeFixture({ projectRoot, specs, replayToken = "f" }) {
  const dayKey = "2026-09-17";
  const {
    materialResolution,
    descriptors
  } = buildValidMaterialResolution({
    dayKey,
    specs
  });

  const materialByDecisionId = new Map(
    materialResolution.materialCatalog.materials.map(row => [
      row.candidateDecisionId,
      row
    ])
  );

  const operations = [];
  const files = [];

  specs.forEach((spec, index) => {
    const descriptor = descriptors[index];
    const token = ((index + 1) % 10).toString();
    const operationId = tokenId("arpo_v1_", token, 24);
    const candidateDecisionId = descriptor.candidateDecisionId;
    const material = materialByDecisionId.get(candidateDecisionId);
    const targetPath = descriptor.targetPath;
    const absolutePath = path.join(projectRoot, ...targetPath.split("/"));

    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

    let preimage;

    if (spec.mode === "REPLACE") {
      const pre = Buffer.from(spec.pre, "utf8");
      fs.writeFileSync(absolutePath, pre);
      preimage = {
        targetExists: true,
        sha256: sha256(pre),
        bytes: pre.length,
        preimageFingerprint: sha256(
          Buffer.from(`pre:${targetPath}:${sha256(pre)}:${pre.length}`)
        )
      };
    } else {
      preimage = {
        targetExists: false,
        sha256: null,
        bytes: null,
        preimageFingerprint: sha256(
          Buffer.from(`pre:${targetPath}:absent`)
        )
      };
    }

    operations.push({
      operationId,
      candidateDecisionId,
      repairClass: "ACQUIRE_VERIFIED_FINAL_EVIDENCE",
      targetPath,
      mutationMode: spec.mode,
      preimage,
      postimage: {
        sourceKind: "TARGET_MATERIAL",
        materialFingerprint: material.materialFingerprint,
        publicationBundleFingerprint: null,
        publicationRole: null,
        contentSha256: material.contentSha256,
        contentBytes: material.contentBytes
      },
      rollback: {
        strategy:
          spec.mode === "CREATE"
            ? "DELETE_CREATED_TARGET"
            : "RESTORE_PREIMAGE"
      }
    });

    files.push({
      absolutePath,
      targetPath,
      postBuffer: Buffer.from(descriptor.postBuffer)
    });
  });

  operations.sort((a, b) =>
    `${a.targetPath}\0${a.operationId}`.localeCompare(
      `${b.targetPath}\0${b.operationId}`
    )
  );

  const transactionPlan = {
    schema: "ai-matchlab.autonomous-repair-execution-transaction-plan.v1",
    version: "1.0.0",
    dayKey,
    generatedAt: "2026-09-17T10:00:00.000Z",
    role: "derived_read_only_bounded_execution_transaction_plan",
    bindings: {
      authorizationId: `arauth_v2_${"a".repeat(32)}`,
      nonce: `arnonce_v2_${"b".repeat(64)}`,
      authorizationFingerprint: "c".repeat(64),
      requestFingerprint: "d".repeat(64),
      planFingerprint: "e".repeat(64),
      verificationFingerprint: "6".repeat(64),
      materialResolutionFingerprint: materialResolution.resolutionFingerprint,
      replayKey: replayToken.repeat(64)
    },
    transactionFingerprint: "",
    repairClassScope: ["ACQUIRE_VERIFIED_FINAL_EVIDENCE"],
    summary: {
      operationCount: operations.length,
      createCount: operations.filter(x => x.mutationMode === "CREATE").length,
      replaceCount: operations.filter(x => x.mutationMode === "REPLACE").length,
      publicationMutationCount: 0,
      totalPostimageBytes: operations.reduce(
        (n, x) => n + x.postimage.contentBytes,
        0
      )
    },
    operations,
    safety: { ...SAFETY },
    authority: { ...AUTHORITY }
  };

  transactionPlan.transactionFingerprint =
    autonomousRepairExecutionTransactionPlanFingerprint(transactionPlan);

  return {
    transactionPlan,
    materialResolution,
    files
  };
}

function makeAdapter(sandbox) {
  return createAutonomousRepairExternalExecutionStateAdapter({
    externalStateRoot: sandbox.state,
    projectRoot: sandbox.project
  });
}

function advance(adapter, journal, state, mutate = null) {
  const next = structuredClone(journal);
  next.state = state;
  next.updatedAt = new Date().toISOString();
  if (mutate) mutate(next);
  next.journalFingerprint = autonomousRepairExecutionJournalFingerprint(next);
  adapter.writeOrAdvanceTransactionJournalAtomically({ journal: next });
  return next;
}

test("sandbox roots must all be disjoint children of the OS temp directory", () => {
  const s = mkSandbox();
  try {
    const roots = validateAutonomousRepairFilesystemTransactionSandboxRoots({
      projectRoot: s.project,
      externalStateRoot: s.state,
      externalBackupRoot: s.backup
    });
    assert.equal(roots.projectRoot, fs.realpathSync(s.project));
    assert.throws(() => validateAutonomousRepairFilesystemTransactionSandboxRoots({
      projectRoot: process.cwd(),
      externalStateRoot: s.state,
      externalBackupRoot: s.backup
    }), /must_be_sandboxed_under_os_tmpdir/);
  } finally { cleanup(s); }
});

test("sandbox CREATE commits exact source-bound postimage with replay and terminal audit", () => {
  const s = mkSandbox();
  try {
    const fixture = makeFixture({
      projectRoot: s.project,
      specs: [{ mode: "CREATE" }]
    });
    const adapter = makeAdapter(s);
    const result = executeAutonomousRepairFilesystemTransactionSandbox({
      ...fixture,
      stateAdapter: adapter,
      externalBackupRoot: s.backup
    });
    assert.equal(result.terminalState, "COMMITTED");
    assert.deepEqual(fs.readFileSync(fixture.files[0].absolutePath), fixture.files[0].postBuffer);
    assert.equal(adapter.readGlobalExecutionLock(), null);
    assert.equal(adapter.inspectRecoveryObligations().ready, true);
    assert.ok(adapter.readReplayConsumption({ replayKey: fixture.transactionPlan.bindings.replayKey }));
    assert.ok(adapter.readExecutionAudit({ transactionId: result.transactionId, terminalState: "COMMITTED" }));
  } finally { cleanup(s); }
});

test("sandbox REPLACE preserves verified external preimage backup and commits exact postimage", () => {
  const s = mkSandbox();
  try {
    const fixture = makeFixture({
      projectRoot: s.project,
      specs: [{ mode: "REPLACE", pre: "old\n" }]
    });
    const adapter = makeAdapter(s);
    const result = executeAutonomousRepairFilesystemTransactionSandbox({
      ...fixture,
      stateAdapter: adapter,
      externalBackupRoot: s.backup
    });
    const journal = adapter.readTransactionJournal({ transactionId: result.transactionId });
    assert.equal(journal.state, "COMMITTED");
    assert.deepEqual(fs.readFileSync(fixture.files[0].absolutePath), fixture.files[0].postBuffer);
    assert.equal(fs.readFileSync(journal.operations[0].backup.path, "utf8"), "old\n");
  } finally { cleanup(s); }
});

test("multi-target sandbox transaction applies canonical operation order and commits all targets", () => {
  const s = mkSandbox();
  try {
    const fixture = makeFixture({
      projectRoot: s.project,
      specs: [
        { mode: "REPLACE", pre: "z-old" },
        { mode: "CREATE" }
      ]
    });
    const adapter = makeAdapter(s);
    const result = executeAutonomousRepairFilesystemTransactionSandbox({
      ...fixture,
      stateAdapter: adapter,
      externalBackupRoot: s.backup
    });
    assert.equal(result.operationCount, 2);
    assert.deepEqual(fs.readFileSync(fixture.files[1].absolutePath), fixture.files[1].postBuffer);
    assert.deepEqual(fs.readFileSync(fixture.files[0].absolutePath), fixture.files[0].postBuffer);
  } finally { cleanup(s); }
});

test("preimage drift under lock fails before replay consumption and leaves project untouched", () => {
  const s = mkSandbox();
  try {
    const fixture = makeFixture({
      projectRoot: s.project,
      specs: [{ mode: "REPLACE", pre: "old" }]
    });
    fs.writeFileSync(fixture.files[0].absolutePath, "drift");
    const adapter = makeAdapter(s);
    assert.throws(() => executeAutonomousRepairFilesystemTransactionSandbox({
      ...fixture,
      stateAdapter: adapter,
      externalBackupRoot: s.backup
    }), /replace_preimage_mismatch/);
    assert.equal(fs.readFileSync(fixture.files[0].absolutePath, "utf8"), "drift");
    assert.equal(adapter.readReplayConsumption({ replayKey: fixture.transactionPlan.bindings.replayKey }), null);
    assert.equal(adapter.readGlobalExecutionLock(), null);
  } finally { cleanup(s); }
});

test("unresolved external recovery obligation blocks a new forward sandbox transaction", () => {
  const s = mkSandbox();
  try {
    const fixture = makeFixture({
      projectRoot: s.project,
      specs: [{ mode: "CREATE" }]
    });
    const adapter = makeAdapter(s);
    const txn = newAutonomousRepairExecutionTransactionId();
    adapter.acquireGlobalExecutionLockAtomically({
      transactionId: txn,
      authorizationId: fixture.transactionPlan.bindings.authorizationId,
      transactionFingerprint: fixture.transactionPlan.transactionFingerprint,
      acquiredAt: new Date().toISOString()
    });
    const journal = buildAutonomousRepairExecutionPreparedJournal({
      transactionId: txn,
      transactionPlan: fixture.transactionPlan,
      updatedAt: new Date().toISOString()
    });
    adapter.writeOrAdvanceTransactionJournalAtomically({ journal });
    adapter.releaseGlobalExecutionLock({ transactionId: txn });

    assert.throws(() => executeAutonomousRepairFilesystemTransactionSandbox({
      ...fixture,
      stateAdapter: adapter,
      externalBackupRoot: s.backup
    }), /recovery_obligation_blocks_forward_execution/);
    assert.equal(fs.existsSync(fixture.files[0].absolutePath), false);
  } finally { cleanup(s); }
});

test("forward failure after first apply automatically reverse-rolls back the exact preimage", () => {
  const s = mkSandbox();
  try {
    const fixture = makeFixture({
      projectRoot: s.project,
      specs: [
        { mode: "REPLACE", pre: "old-a" },
        { mode: "CREATE" }
      ]
    });
    const adapter = makeAdapter(s);
    const faultAdapter = {
      ...adapter,
      writeOrAdvanceTransactionJournalAtomically({ journal }) {
        if (
          journal.state === "APPLYING" &&
          journal.operations.filter(x => x.applied).length === 1
        ) {
          throw new Error("injected_after_first_apply");
        }
        return adapter.writeOrAdvanceTransactionJournalAtomically({ journal });
      }
    };

    assert.throws(() => executeAutonomousRepairFilesystemTransactionSandbox({
      ...fixture,
      stateAdapter: faultAdapter,
      externalBackupRoot: s.backup
    }), /injected_after_first_apply/);

    assert.equal(fs.readFileSync(fixture.files[0].absolutePath, "utf8"), "old-a");
    assert.equal(fs.existsSync(fixture.files[1].absolutePath), false);
    const journals = adapter.listTransactionJournals();
    assert.equal(journals.length, 1);
    assert.equal(journals[0].state, "ROLLED_BACK");
    assert.equal(adapter.readGlobalExecutionLock(), null);
    assert.ok(adapter.readReplayConsumption({ replayKey: fixture.transactionPlan.bindings.replayKey }));
  } finally { cleanup(s); }
});

test("rolled-back replay identity remains consumed and a second forward attempt cannot mutate", () => {
  const s = mkSandbox();
  try {
    const fixture = makeFixture({
      projectRoot: s.project,
      specs: [{ mode: "REPLACE", pre: "old" }]
    });
    const adapter = makeAdapter(s);
    const faultAdapter = {
      ...adapter,
      writeOrAdvanceTransactionJournalAtomically({ journal }) {
        if (journal.state === "POSTIMAGES_VERIFIED") {
          throw new Error("injected_before_commit");
        }
        return adapter.writeOrAdvanceTransactionJournalAtomically({ journal });
      }
    };
    assert.throws(() => executeAutonomousRepairFilesystemTransactionSandbox({
      ...fixture,
      stateAdapter: faultAdapter,
      externalBackupRoot: s.backup
    }), /injected_before_commit/);
    assert.equal(fs.readFileSync(fixture.files[0].absolutePath, "utf8"), "old");

    assert.throws(() => executeAutonomousRepairFilesystemTransactionSandbox({
      ...fixture,
      stateAdapter: adapter,
      externalBackupRoot: s.backup
    }), /replay_already_consumed/);
    assert.equal(fs.readFileSync(fixture.files[0].absolutePath, "utf8"), "old");
    assert.equal(adapter.readGlobalExecutionLock(), null);
  } finally { cleanup(s); }
});

test("crash recovery detects CREATE postimage applied before journal progress and deletes it", () => {
  const s = mkSandbox();
  try {
    const fixture = makeFixture({
      projectRoot: s.project,
      specs: [{ mode: "CREATE" }]
    });
    const adapter = makeAdapter(s);
    const txn = newAutonomousRepairExecutionTransactionId();
    adapter.acquireGlobalExecutionLockAtomically({
      transactionId: txn,
      authorizationId: fixture.transactionPlan.bindings.authorizationId,
      transactionFingerprint: fixture.transactionPlan.transactionFingerprint,
      acquiredAt: new Date().toISOString()
    });
    let journal = buildAutonomousRepairExecutionPreparedJournal({
      transactionId: txn,
      transactionPlan: fixture.transactionPlan,
      updatedAt: new Date().toISOString()
    });
    adapter.writeOrAdvanceTransactionJournalAtomically({ journal });
    adapter.consumeOnceAtomically({
      replayKey: fixture.transactionPlan.bindings.replayKey,
      authorizationId: fixture.transactionPlan.bindings.authorizationId,
      authorizationFingerprint: fixture.transactionPlan.bindings.authorizationFingerprint,
      transactionId: txn,
      consumedAt: new Date().toISOString()
    });
    journal = advance(adapter, journal, "REPLAY_CONSUMED");
    journal = advance(adapter, journal, "BACKUPS_VERIFIED");
    journal = advance(adapter, journal, "TEMPS_VERIFIED");
    journal = advance(adapter, journal, "APPLYING");
    fs.writeFileSync(fixture.files[0].absolutePath, fixture.files[0].postBuffer);

    const result = recoverAutonomousRepairFilesystemTransactionSandbox({
      transactionId: txn,
      ...fixture,
      stateAdapter: adapter,
      externalBackupRoot: s.backup
    });
    assert.equal(result.terminalState, "ROLLED_BACK");
    assert.equal(fs.existsSync(fixture.files[0].absolutePath), false);
    assert.equal(adapter.readGlobalExecutionLock(), null);
  } finally { cleanup(s); }
});

test("crash recovery restores REPLACE postimage from the exact external backup", () => {
  const s = mkSandbox();
  try {
    const fixture = makeFixture({
      projectRoot: s.project,
      specs: [{ mode: "REPLACE", pre: "old" }]
    });
    const adapter = makeAdapter(s);
    const txn = newAutonomousRepairExecutionTransactionId();
    adapter.acquireGlobalExecutionLockAtomically({
      transactionId: txn,
      authorizationId: fixture.transactionPlan.bindings.authorizationId,
      transactionFingerprint: fixture.transactionPlan.transactionFingerprint,
      acquiredAt: new Date().toISOString()
    });
    let journal = buildAutonomousRepairExecutionPreparedJournal({
      transactionId: txn,
      transactionPlan: fixture.transactionPlan,
      updatedAt: new Date().toISOString()
    });
    adapter.writeOrAdvanceTransactionJournalAtomically({ journal });
    adapter.consumeOnceAtomically({
      replayKey: fixture.transactionPlan.bindings.replayKey,
      authorizationId: fixture.transactionPlan.bindings.authorizationId,
      authorizationFingerprint: fixture.transactionPlan.bindings.authorizationFingerprint,
      transactionId: txn,
      consumedAt: new Date().toISOString()
    });
    journal = advance(adapter, journal, "REPLAY_CONSUMED");

    const op = fixture.transactionPlan.operations[0];
    const txBackupDir = path.join(s.backup, txn);
    fs.mkdirSync(txBackupDir);
    const backupPath = path.join(txBackupDir, `${op.operationId}.preimage.bin`);
    fs.writeFileSync(backupPath, "old");
    journal = advance(adapter, journal, "BACKUPS_VERIFIED", next => {
      next.operations[0].backup = {
        path: backupPath,
        sha256: op.preimage.sha256,
        bytes: op.preimage.bytes
      };
    });
    journal = advance(adapter, journal, "TEMPS_VERIFIED");
    journal = advance(adapter, journal, "APPLYING");
    fs.writeFileSync(fixture.files[0].absolutePath, fixture.files[0].postBuffer);

    const result = recoverAutonomousRepairFilesystemTransactionSandbox({
      transactionId: txn,
      ...fixture,
      stateAdapter: adapter,
      externalBackupRoot: s.backup
    });
    assert.equal(result.terminalState, "ROLLED_BACK");
    assert.equal(fs.readFileSync(fixture.files[0].absolutePath, "utf8"), "old");
  } finally { cleanup(s); }
});

test("ambiguous crash target becomes RECOVERY_REQUIRED and retains the transaction lock", () => {
  const s = mkSandbox();
  try {
    const fixture = makeFixture({
      projectRoot: s.project,
      specs: [{ mode: "CREATE" }]
    });
    const adapter = makeAdapter(s);
    const txn = newAutonomousRepairExecutionTransactionId();
    adapter.acquireGlobalExecutionLockAtomically({
      transactionId: txn,
      authorizationId: fixture.transactionPlan.bindings.authorizationId,
      transactionFingerprint: fixture.transactionPlan.transactionFingerprint,
      acquiredAt: new Date().toISOString()
    });
    let journal = buildAutonomousRepairExecutionPreparedJournal({
      transactionId: txn,
      transactionPlan: fixture.transactionPlan,
      updatedAt: new Date().toISOString()
    });
    adapter.writeOrAdvanceTransactionJournalAtomically({ journal });
    adapter.consumeOnceAtomically({
      replayKey: fixture.transactionPlan.bindings.replayKey,
      authorizationId: fixture.transactionPlan.bindings.authorizationId,
      authorizationFingerprint: fixture.transactionPlan.bindings.authorizationFingerprint,
      transactionId: txn,
      consumedAt: new Date().toISOString()
    });
    journal = advance(adapter, journal, "REPLAY_CONSUMED");
    journal = advance(adapter, journal, "BACKUPS_VERIFIED");
    journal = advance(adapter, journal, "TEMPS_VERIFIED");
    journal = advance(adapter, journal, "APPLYING");
    fs.writeFileSync(fixture.files[0].absolutePath, "intruder");

    const result = recoverAutonomousRepairFilesystemTransactionSandbox({
      transactionId: txn,
      ...fixture,
      stateAdapter: adapter,
      externalBackupRoot: s.backup
    });
    assert.equal(result.terminalState, "RECOVERY_REQUIRED");
    assert.equal(result.ok, false);
    assert.equal(adapter.readGlobalExecutionLock().transactionId, txn);
  } finally { cleanup(s); }
});

test("terminal COMMITTED journal missing its audit is completed without replaying writes", () => {
  const s = mkSandbox();
  try {
    const fixture = makeFixture({
      projectRoot: s.project,
      specs: [{ mode: "CREATE" }]
    });
    const adapter = makeAdapter(s);
    const txn = newAutonomousRepairExecutionTransactionId();
    adapter.acquireGlobalExecutionLockAtomically({
      transactionId: txn,
      authorizationId: fixture.transactionPlan.bindings.authorizationId,
      transactionFingerprint: fixture.transactionPlan.transactionFingerprint,
      acquiredAt: new Date().toISOString()
    });
    let journal = buildAutonomousRepairExecutionPreparedJournal({
      transactionId: txn,
      transactionPlan: fixture.transactionPlan,
      updatedAt: new Date().toISOString()
    });
    adapter.writeOrAdvanceTransactionJournalAtomically({ journal });
    adapter.consumeOnceAtomically({
      replayKey: fixture.transactionPlan.bindings.replayKey,
      authorizationId: fixture.transactionPlan.bindings.authorizationId,
      authorizationFingerprint: fixture.transactionPlan.bindings.authorizationFingerprint,
      transactionId: txn,
      consumedAt: new Date().toISOString()
    });
    journal = advance(adapter, journal, "REPLAY_CONSUMED");
    journal = advance(adapter, journal, "BACKUPS_VERIFIED");
    journal = advance(adapter, journal, "TEMPS_VERIFIED");
    journal = advance(adapter, journal, "APPLYING");
    fs.writeFileSync(fixture.files[0].absolutePath, fixture.files[0].postBuffer);
    journal = advance(adapter, journal, "APPLYING", next => { next.operations[0].applied = true; });
    journal = advance(adapter, journal, "POSTIMAGES_VERIFIED");
    journal = advance(adapter, journal, "COMMITTED");
    assert.equal(adapter.readExecutionAudit({ transactionId: txn, terminalState: "COMMITTED" }), null);

    const result = recoverAutonomousRepairFilesystemTransactionSandbox({
      transactionId: txn,
      ...fixture,
      stateAdapter: adapter,
      externalBackupRoot: s.backup
    });
    assert.equal(result.terminalState, "COMMITTED");
    assert.ok(adapter.readExecutionAudit({ transactionId: txn, terminalState: "COMMITTED" }));
    assert.deepEqual(fs.readFileSync(fixture.files[0].absolutePath), fixture.files[0].postBuffer);
    assert.equal(adapter.readGlobalExecutionLock(), null);
  } finally { cleanup(s); }
});

test("PREPARED crash without replay consumption terminates ABORTED_PRE_CONSUME", () => {
  const s = mkSandbox();
  try {
    const fixture = makeFixture({
      projectRoot: s.project,
      specs: [{ mode: "CREATE" }]
    });
    const adapter = makeAdapter(s);
    const txn = newAutonomousRepairExecutionTransactionId();
    adapter.acquireGlobalExecutionLockAtomically({
      transactionId: txn,
      authorizationId: fixture.transactionPlan.bindings.authorizationId,
      transactionFingerprint: fixture.transactionPlan.transactionFingerprint,
      acquiredAt: new Date().toISOString()
    });
    const journal = buildAutonomousRepairExecutionPreparedJournal({
      transactionId: txn,
      transactionPlan: fixture.transactionPlan,
      updatedAt: new Date().toISOString()
    });
    adapter.writeOrAdvanceTransactionJournalAtomically({ journal });

    const result = recoverAutonomousRepairFilesystemTransactionSandbox({
      transactionId: txn,
      ...fixture,
      stateAdapter: adapter,
      externalBackupRoot: s.backup
    });
    assert.equal(result.terminalState, "ABORTED_PRE_CONSUME");
    assert.equal(fs.existsSync(fixture.files[0].absolutePath), false);
    assert.equal(adapter.readGlobalExecutionLock(), null);
  } finally { cleanup(s); }
});

test("nonterminal journal without its required replay record fails closed as RECOVERY_REQUIRED", () => {
  const s = mkSandbox();
  try {
    const fixture = makeFixture({
      projectRoot: s.project,
      specs: [{ mode: "CREATE" }]
    });
    const adapter = makeAdapter(s);
    const txn = newAutonomousRepairExecutionTransactionId();
    adapter.acquireGlobalExecutionLockAtomically({
      transactionId: txn,
      authorizationId: fixture.transactionPlan.bindings.authorizationId,
      transactionFingerprint: fixture.transactionPlan.transactionFingerprint,
      acquiredAt: new Date().toISOString()
    });
    let journal = buildAutonomousRepairExecutionPreparedJournal({
      transactionId: txn,
      transactionPlan: fixture.transactionPlan,
      updatedAt: new Date().toISOString()
    });
    adapter.writeOrAdvanceTransactionJournalAtomically({ journal });
    journal = advance(adapter, journal, "REPLAY_CONSUMED");

    const result = recoverAutonomousRepairFilesystemTransactionSandbox({
      transactionId: txn,
      ...fixture,
      stateAdapter: adapter,
      externalBackupRoot: s.backup
    });
    assert.equal(result.terminalState, "RECOVERY_REQUIRED");
    assert.equal(result.ok, false);
    assert.equal(adapter.readGlobalExecutionLock().transactionId, txn);
  } finally { cleanup(s); }
});

test("sandbox kernel source exposes no production project-root entrypoint", () => {
  const source = fs.readFileSync(fileURLToPath(new URL("./autonomous-repair-filesystem-transaction-kernel.js", import.meta.url)), "utf8");
  assert.match(source, /executeAutonomousRepairFilesystemTransactionSandbox/u);
  assert.match(source, /recoverAutonomousRepairFilesystemTransactionSandbox/u);
  assert.doesNotMatch(source, /export function executeAutonomousRepairFilesystemTransactionProduction/u);
  assert.match(source, /must_be_sandboxed_under_os_tmpdir/u);
});
