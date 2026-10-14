"""Preserve completed GitHub writer logs as data. Never extract or execute them."""
import argparse
import base64
import hashlib
import io
import json
import os
import re
import tempfile
import zipfile
import zlib
from datetime import datetime, timezone
from pathlib import Path

WRITERS = {
    "Daily deploy snapshot", "Daily autonomous run", "Intraday deploy snapshot refresh",
    "Odds refresh", "Plan C shadow daily publish", "Bounded Value data recovery",
    "Pre-match Value data alarm canary", "History preservation and recovery canary",
}

def evidence(info, archive, repository, run_id, attempt):
    if (info.get("id") != run_id or info.get("run_attempt") != attempt or
        info.get("head_repository", {}).get("full_name") != repository or
        info.get("head_branch") != "main" or info.get("status") != "completed" or
        info.get("name") not in WRITERS or
        not re.fullmatch(r"[a-f0-9]{40,64}", info.get("head_sha", ""))):
        raise ValueError("untrusted_or_incomplete_workflow_run")
    result = {
        "schema": "ai-matchlab.completed-workflow-logs.v1", "repository": repository,
        "runId": run_id, "attempt": attempt, "workflow": info["name"],
        "sourceCommit": info["head_sha"], "runConclusion": info.get("conclusion"),
        "runUrl": f"https://github.com/{repository}/actions/runs/{run_id}",
        "retrievedAt": datetime.now(timezone.utc).isoformat(),
        "scope": "completed_workflow_log_archive", "valueExecutionOutcome": "not_inferred",
        "logStatus": "LOG_ARCHIVE_UNAVAILABLE", "publicationApproved": False,
    }
    if archive is None:
        return result
    result.update(logBytes=len(archive), logSha256=hashlib.sha256(archive).hexdigest())
    if len(archive) > 64 * 1024 * 1024:
        result["logStatus"] = "LOG_ARCHIVE_TOO_LARGE"
        return result
    # Keep even corrupt bytes for diagnosis. Metadata never labels them valid.
    result["logBytesBase64"] = base64.b64encode(archive).decode("ascii")
    result["logStatus"] = "LOG_ARCHIVE_INVALID"
    try:
        with zipfile.ZipFile(io.BytesIO(archive)) as logs:
            entries = logs.infolist()
            if sum(entry.file_size for entry in entries) > 512 * 1024 * 1024:
                return result
            if logs.testzip() is not None:
                return result
            result.update(logStatus="LOG_ARCHIVE_SAVED", logEntries=len(entries))
    except (zipfile.BadZipFile, RuntimeError, OSError, NotImplementedError, zlib.error, EOFError):
        pass
    return result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--metadata", required=True)
    parser.add_argument("--archive", required=True)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--run", type=int, required=True)
    parser.add_argument("--attempt", type=int, required=True)
    args = parser.parse_args()
    archive = Path(args.archive)
    result = evidence(json.loads(Path(args.metadata).read_text()),
                      archive.read_bytes() if archive.is_file() else None,
                      args.repository, args.run, args.attempt)
    destination = Path("data/ingest-state/workflow-logs") / str(args.run) / f"{args.attempt}.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf8", dir=destination.parent, delete=False) as handle:
        json.dump(result, handle, ensure_ascii=False, indent=2)
        handle.flush()
        os.fsync(handle.fileno())
        temporary = handle.name
    os.replace(temporary, destination)
    print(json.dumps({"runId": args.run, "attempt": args.attempt, "logStatus": result["logStatus"], "file": str(destination)}))
    return 0 if result["logStatus"] == "LOG_ARCHIVE_SAVED" else 1

if __name__ == "__main__":
    raise SystemExit(main())
