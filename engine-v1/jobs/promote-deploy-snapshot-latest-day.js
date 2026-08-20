import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveDataPath,
  ensureDir
} from "../storage/data-root.js";

import {
  verifyDailyPublishContract
} from "./verify-daily-publish-contract.js";

function clean(value) {
  return String(value ?? "").trim();
}

function readJson(file) {
  if (!fs.existsSync(file)) {
    return {
      exists: false,
      payload: null,
      error: null
    };
  }

  try {
    return {
      exists: true,
      payload:
        JSON.parse(
          fs.readFileSync(
            file,
            "utf8"
          )
        ),
      error: null
    };
  }
  catch (error) {
    return {
      exists: true,
      payload: null,
      error:
        error?.message ||
        String(error)
    };
  }
}

export function writeJsonAtomic(
  file,
  payload
) {
  const dir =
    path.dirname(file);

  ensureDir(dir);

  const tempFile =
    path.join(
      dir,
      `.${path.basename(file)}.${process.pid}.${Date.now()}.${Math.random()
        .toString(16)
        .slice(2)}.tmp`
    );

  const body =
    `${JSON.stringify(
      payload,
      null,
      2
    )}\n`;

  let handle = null;

  try {
    handle =
      fs.openSync(
        tempFile,
        "wx"
      );

    fs.writeFileSync(
      handle,
      body,
      "utf8"
    );

    fs.fsyncSync(handle);
    fs.closeSync(handle);
    handle = null;

    fs.renameSync(
      tempFile,
      file
    );
  }
  finally {
    if (handle !== null) {
      try {
        fs.closeSync(handle);
      }
      catch {
        // Preserve the original write/rename failure.
      }
    }

    if (
      fs.existsSync(tempFile)
    ) {
      fs.rmSync(
        tempFile,
        {
          force: true
        }
      );
    }
  }
}

export function promoteDeploySnapshotLatestDay(
  dayKey,
  options = {}
) {
  const day =
    clean(dayKey);

  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(
      day
    )
  ) {
    return {
      ok: false,
      dayKey: day,
      reason:
        "invalid_day_key"
    };
  }

  const dataPath =
    typeof options.resolveDataPath ===
      "function"
      ? options.resolveDataPath
      : resolveDataPath;

  const contractVerifier =
    typeof options.verifyContract ===
      "function"
      ? options.verifyContract
      : verifyDailyPublishContract;

  const prepublish =
    contractVerifier(
      day,
      {
        resolveDataPath:
          dataPath,
        requireLatest:
          false
      }
    );

  if (
    prepublish?.ok !== true
  ) {
    return {
      ok: false,
      dayKey: day,
      reason:
        "prepublish_contract_failed",
      prepublish
    };
  }

  const manifestFile =
    dataPath(
      "deploy-snapshots",
      day,
      "manifest.json"
    );

  const manifestState =
    readJson(manifestFile);

  if (
    !manifestState.exists ||
    manifestState.error ||
    !manifestState.payload
  ) {
    return {
      ok: false,
      dayKey: day,
      reason:
        "manifest_invalid",
      error:
        manifestState.error ||
        null
    };
  }

  const manifest =
    manifestState.payload;

  if (
    clean(
      manifest.date ||
      manifest.dayKey
    ) !== day
  ) {
    return {
      ok: false,
      dayKey: day,
      reason:
        "manifest_day_mismatch"
    };
  }

  const manifestHash =
    clean(manifest.hash)
      .toLowerCase();

  if (
    !/^[a-f0-9]{64}$/u.test(
      manifestHash
    )
  ) {
    return {
      ok: false,
      dayKey: day,
      reason:
        "manifest_hash_invalid"
    };
  }

  const latestFile =
    dataPath(
      "deploy-snapshots",
      "latest.json"
    );

  const existing =
    readJson(latestFile);

  if (
    existing.exists &&
    existing.error
  ) {
    return {
      ok: false,
      dayKey: day,
      reason:
        "existing_latest_invalid_json",
      error:
        existing.error
    };
  }

  const existingDay =
    clean(
      existing
        .payload
        ?.date ||
      existing
        .payload
        ?.dayKey
    );

  if (
    existingDay &&
    existingDay > day
  ) {
    return {
      ok: false,
      dayKey: day,
      reason:
        "backward_latest_promotion_refused",
      existingDay
    };
  }

  const latest = {
    ok: true,
    date: day,
    generatedAt:
      manifest.generatedAt,
    manifest:
      `data/deploy-snapshots/${day}/manifest.json`,
    fixtures:
      `data/deploy-snapshots/${day}/fixtures.json`,
    value:
      `data/deploy-snapshots/${day}/value.json`,
    detailsDir:
      `data/deploy-snapshots/${day}/details`,
    hash:
      manifestHash
  };

  const same =
    existing.exists &&
    JSON.stringify(
      existing.payload
    ) ===
    JSON.stringify(
      latest
    );

  if (same) {
    return {
      ok: true,
      dayKey: day,
      updated: false,
      idempotent: true,
      latestFile,
      latest,
      prepublish
    };
  }

  writeJsonAtomic(
    latestFile,
    latest
  );

  return {
    ok: true,
    dayKey: day,
    updated: true,
    idempotent: false,
    latestFile,
    latest,
    prepublish
  };
}

function parseArgs(
  argv =
    process.argv.slice(2)
) {
  let dayKey = "";

  for (const arg of argv) {
    if (
      /^\d{4}-\d{2}-\d{2}$/u.test(
        arg
      )
    ) {
      dayKey = arg;
      continue;
    }

    if (
      arg.startsWith("--date=")
    ) {
      dayKey =
        arg.slice(
          "--date=".length
        );

      continue;
    }

    throw new Error(
      `Unknown argument: ${arg}`
    );
  }

  return {
    dayKey
  };
}

const isCli =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    fileURLToPath(import.meta.url);

if (isCli) {
  try {
    const {
      dayKey
    } = parseArgs();

    const result =
      promoteDeploySnapshotLatestDay(
        dayKey
      );

    console.log(
      JSON.stringify(
        result,
        null,
        2
      )
    );

    if (!result.ok) {
      process.exitCode = 1;
    }
  }
  catch (error) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          stage:
            "promote_deploy_snapshot_latest_failed",
          error:
            error?.message ||
            String(error)
        },
        null,
        2
      )
    );

    process.exitCode = 1;
  }
}