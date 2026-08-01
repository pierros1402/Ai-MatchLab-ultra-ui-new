import crypto from "node:crypto";
import fs from "node:fs";

export function canonicalTextBuffer(buffer) {
  return Buffer.from(
    Buffer.from(buffer).toString("utf8").replace(/\r\n?/g, "\n"),
    "utf8"
  );
}

export function canonicalFileBytes(filePath) {
  return canonicalTextBuffer(fs.readFileSync(filePath)).length;
}

export function canonicalFileSha256(filePath) {
  return crypto
    .createHash("sha256")
    .update(canonicalTextBuffer(fs.readFileSync(filePath)))
    .digest("hex");
}

export function bufferSha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function canonicalBufferSha256(buffer) {
  return bufferSha256(canonicalTextBuffer(buffer));
}

export function deploySnapshotManifestHashPayload(manifest) {
  const details = Array.isArray(manifest?.details)
    ? manifest.details.map(row => {
        const item = {
          file: row?.file,
          bytes: row?.bytes,
          hasTravel: row?.hasTravel,
          hasPlayerUsage: row?.hasPlayerUsage,
          hasTeamNews: row?.hasTeamNews,
          hasValue: row?.hasValue
        };
        if (row?.sha256) item.sha256 = row.sha256;
        return item;
      })
    : [];

  const payload = {
    date: manifest?.date,
    counts: manifest?.counts,
    fixturesSource: manifest?.fixturesSource,
    staticMinTargetFixtures: manifest?.staticMinTargetFixtures,
    minTargetFixtures: manifest?.minTargetFixtures,
    minTargetFixtureSource: manifest?.minTargetFixtureSource,
    canonicalCoverageFixtureCount: manifest?.canonicalCoverageFixtureCount,
    coverage: manifest?.coverage,
    sizes: manifest?.sizes,
    details
  };

  if (manifest?.fileHashes && typeof manifest.fileHashes === "object") {
    payload.fileHashes = manifest.fileHashes;
  }

  return payload;
}

export function computeDeploySnapshotManifestHash(manifest) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(deploySnapshotManifestHashPayload(manifest)))
    .digest("hex");
}

export function validateDeploySnapshotManifest(manifest, expectedDay = "") {
  const errors = [];
  const day = String(expectedDay || "");

  if (!manifest || typeof manifest !== "object") errors.push("manifest_not_object");
  if (manifest?.ok !== true) errors.push("manifest_not_ok");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(manifest?.date || ""))) {
    errors.push("manifest_date_invalid");
  }
  if (day && manifest?.date !== day) errors.push("manifest_date_mismatch");
  if (!manifest?.counts || typeof manifest.counts !== "object") {
    errors.push("manifest_counts_missing");
  }
  if (!Array.isArray(manifest?.details)) errors.push("manifest_details_missing");

  const v2 = String(manifest?.version || "") === "deploy-snapshot-v2";
  const fileHashes = manifest?.fileHashes;
  if (v2 && (!fileHashes || typeof fileHashes !== "object" || Array.isArray(fileHashes))) {
    errors.push("manifest_file_hashes_missing");
  }

  if (fileHashes && typeof fileHashes === "object" && !Array.isArray(fileHashes)) {
    for (const [name, hash] of Object.entries(fileHashes)) {
      if (!/^[A-Za-z0-9._~-]+\.json$/.test(name) || name.includes("..")) {
        errors.push(`manifest_file_hash_name_invalid:${name}`);
      }
      if (!/^[0-9a-f]{64}$/i.test(String(hash || ""))) {
        errors.push(`manifest_file_hash_invalid:${name}`);
      }
    }
  }

  if (v2) {
    for (const required of ["fixtures.json", "value.json"]) {
      if (!fileHashes?.[required]) errors.push(`manifest_required_file_hash_missing:${required}`);
    }
    if (manifest?.files?.valueAudit && !fileHashes?.[manifest.files.valueAudit]) {
      errors.push(`manifest_required_file_hash_missing:${manifest.files.valueAudit}`);
    }
  }

  const detailFiles = new Set();
  for (const detail of Array.isArray(manifest?.details) ? manifest.details : []) {
    const file = String(detail?.file || "");
    if (!/^[A-Za-z0-9._~-]+\.json$/.test(file) || file.includes("..")) {
      errors.push(`detail_file_invalid:${file}`);
      continue;
    }
    if (detailFiles.has(file)) errors.push(`detail_file_duplicate:${file}`);
    detailFiles.add(file);
    if (!Number.isInteger(Number(detail?.bytes)) || Number(detail.bytes) < 0) {
      errors.push(`detail_bytes_invalid:${file}`);
    }
    if (v2 && !detail?.sha256) {
      errors.push(`detail_sha256_missing:${file}`);
    } else if (detail?.sha256 && !/^[0-9a-f]{64}$/i.test(String(detail.sha256))) {
      errors.push(`detail_sha256_invalid:${file}`);
    }
  }

  if (
    Number.isInteger(Number(manifest?.counts?.details)) &&
    Number(manifest.counts.details) !== detailFiles.size
  ) {
    errors.push("manifest_detail_count_mismatch");
  }

  const computedHash = computeDeploySnapshotManifestHash(manifest);
  if (!/^[0-9a-f]{64}$/i.test(String(manifest?.hash || ""))) {
    errors.push("manifest_hash_invalid");
  } else if (String(manifest.hash).toLowerCase() !== computedHash) {
    errors.push("manifest_hash_mismatch");
  }

  return {
    ok: errors.length === 0,
    errors,
    computedHash,
    detailFiles: [...detailFiles].sort()
  };
}
