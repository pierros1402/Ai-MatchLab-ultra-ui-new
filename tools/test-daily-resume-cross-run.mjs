import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { digest } from "../engine-v1/core/daily-resume-contract.mjs";
import {
  packResumeTransport, verifyResumeTransport, stageResumeTransport
} from "../engine-v1/core/daily-resume-transport.mjs";

// CI-only demonstration. Never references or writes live production data.
const mode = process.argv[2];
const bundleRoot = process.argv[3];
assert.ok(mode === "producer" || mode === "consumer", "invalid_mode");
assert.ok(bundleRoot && path.isAbsolute(bundleRoot), "absolute_bundle_path_required");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-cross-run-ci-"));
try {
  const data = path.join(root, "data");
  fs.mkdirSync(data);
  fs.mkdirSync(path.join(data, "derived"));
  fs.writeFileSync(path.join(data, "input.txt"), "frozen-source-v1\n");
  if (mode === "producer") fs.writeFileSync(path.join(data, "derived", "result.txt"), "derived-output-v1\n");
  const custody = {
    repository: process.env.GITHUB_REPOSITORY,
    runId: process.env.GITHUB_RUN_ID,
    attempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    producerCommit: process.env.GITHUB_SHA,
    dayKey: "2026-11-23",
    stageId: "synthetic-derive"
  };
  const binding = {
    root: data, dayKey: custody.dayKey, producerCommit: custody.producerCommit,
    contractSha256: digest(Buffer.from("synthetic-cross-run-contract-v1"))
  };
  const stage = { id: custody.stageId, dependsOn: [], inputs: ["input.txt"], outputs: ["derived/result.txt"] };
  if (mode === "producer") {
    const result = packResumeTransport({ stage, binding, dependencies: {},
      storeRoot: path.join(root, "archive"), bundleRoot, custody });
    assert.equal(result.count, 2);
    assert.equal(verifyResumeTransport({ stage, binding, bundleRoot, expectedCustody: custody }).ok, true);
    console.log("PRODUCER_TRANSPORT_PASS=" + JSON.stringify({
      checkpointSha256: result.checkpointSha256, runId: custody.runId, attempt: custody.attempt
    }));
  } else {
    const verified = verifyResumeTransport({ stage, binding, bundleRoot, expectedCustody: custody });
    assert.equal(verified.ok, true, verified.reason);
    const staged = stageResumeTransport({ stage, binding, bundleRoot, expectedCustody: custody,
      stagingParent: root });
    assert.equal(fs.readFileSync(path.join(staged.staging, "derived", "result.txt"), "utf8"), "derived-output-v1\n");
    assert.equal(fs.existsSync(path.join(data, "derived", "result.txt")), false,
      "consumer must not write outputs into canonical workspace");
    console.log("CROSS_RUN_TRANSPORT_PASS=" + JSON.stringify({
      checkpointSha256: verified.checkpointSha256, runId: custody.runId, attempt: custody.attempt
    }));
  }
} finally { fs.rmSync(root, { recursive: true, force: true }); }
