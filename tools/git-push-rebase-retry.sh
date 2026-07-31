#!/usr/bin/env bash
# Push local commits, surviving non-fast-forward races against other workflows.
#
# Tracked dirty files are handled by rebase.autoStash. Generated untracked files
# are backed up outside the worktree before rebase, then restored only when the
# rebased tree does not already contain an equal path. A differing collision is
# fail-closed and the preserved copy is reported for diagnosis.
set -euo pipefail

BRANCH="${GITHUB_REF_NAME:-main}"
ATTEMPTS="${PUSH_RETRY_ATTEMPTS:-5}"
BACKUP_ROOT=""
UNTRACKED_LIST=""

cleanup_backup() {
  if [[ -n "${BACKUP_ROOT}" && -d "${BACKUP_ROOT}" ]]; then
    rm -rf "${BACKUP_ROOT}"
  fi
}

trap cleanup_backup EXIT

backup_untracked() {
  local count

  BACKUP_ROOT="$(mktemp -d "${RUNNER_TEMP:-/tmp}/aiml-push-retry-untracked.XXXXXX")"
  UNTRACKED_LIST="${BACKUP_ROOT}/paths.zlist"

  git ls-files --others --exclude-standard -z > "${UNTRACKED_LIST}"
  count="$(python3 - "${UNTRACKED_LIST}" <<'PY'
import pathlib, sys
raw = pathlib.Path(sys.argv[1]).read_bytes()
print(sum(1 for item in raw.split(b"\0") if item))
PY
)"

  echo "push-retry untracked backup count=${count} root=${BACKUP_ROOT}"

  if [[ "${count}" == "0" ]]; then
    return 0
  fi

  mkdir -p "${BACKUP_ROOT}/files"

  python3 - "${UNTRACKED_LIST}" "${BACKUP_ROOT}/files" <<'PY'
import os
import pathlib
import shutil
import sys

list_path = pathlib.Path(sys.argv[1])
backup_root = pathlib.Path(sys.argv[2])

for raw in list_path.read_bytes().split(b"\0"):
    if not raw:
        continue
    rel = os.fsdecode(raw)
    source = pathlib.Path(rel)
    destination = backup_root / rel
    destination.parent.mkdir(parents=True, exist_ok=True)
    if source.is_symlink():
        destination.symlink_to(os.readlink(source))
    elif source.is_dir():
        shutil.copytree(source, destination, symlinks=True, dirs_exist_ok=True)
    else:
        shutil.copy2(source, destination)

# Remove only paths proven untracked by git. Process deepest paths first so
# nested files disappear before their now-empty parent directories.
paths = [os.fsdecode(raw) for raw in list_path.read_bytes().split(b"\0") if raw]
for rel in sorted(paths, key=lambda value: (value.count(os.sep), len(value)), reverse=True):
    source = pathlib.Path(rel)
    if source.is_symlink() or source.is_file():
        source.unlink(missing_ok=True)
    elif source.is_dir():
        shutil.rmtree(source)
PY
}

restore_untracked() {
  local conflict_root="${GITHUB_WORKSPACE:-$PWD}/.git/aiml-push-retry-untracked-conflicts/$(date -u +%Y%m%dT%H%M%SZ)"

  if [[ -z "${UNTRACKED_LIST}" || ! -s "${UNTRACKED_LIST}" ]]; then
    return 0
  fi

  python3 - "${UNTRACKED_LIST}" "${BACKUP_ROOT}/files" "${conflict_root}" <<'PY'
import filecmp
import os
import pathlib
import shutil
import sys

list_path = pathlib.Path(sys.argv[1])
backup_root = pathlib.Path(sys.argv[2])
conflict_root = pathlib.Path(sys.argv[3])
conflicts = []
restored = 0
identical = 0

def equal(a: pathlib.Path, b: pathlib.Path) -> bool:
    if a.is_symlink() or b.is_symlink():
        return a.is_symlink() and b.is_symlink() and os.readlink(a) == os.readlink(b)
    if a.is_dir() or b.is_dir():
        return a.is_dir() and b.is_dir() and filecmp.dircmp(a, b).diff_files == []
    return filecmp.cmp(a, b, shallow=False)

for raw in list_path.read_bytes().split(b"\0"):
    if not raw:
        continue
    rel = os.fsdecode(raw)
    saved = backup_root / rel
    target = pathlib.Path(rel)

    if not target.exists() and not target.is_symlink():
        target.parent.mkdir(parents=True, exist_ok=True)
        if saved.is_symlink():
            target.symlink_to(os.readlink(saved))
        elif saved.is_dir():
            shutil.copytree(saved, target, symlinks=True)
        else:
            shutil.copy2(saved, target)
        restored += 1
        continue

    if equal(saved, target):
        identical += 1
        continue

    preserved = conflict_root / rel
    preserved.parent.mkdir(parents=True, exist_ok=True)
    if saved.is_symlink():
        preserved.symlink_to(os.readlink(saved))
    elif saved.is_dir():
        shutil.copytree(saved, preserved, symlinks=True, dirs_exist_ok=True)
    else:
        shutil.copy2(saved, preserved)
    conflicts.append(rel)

print(f"push-retry untracked restored={restored} identical_after_rebase={identical} conflicts={len(conflicts)}")
if conflicts:
    print(f"ERROR: differing untracked files preserved under {conflict_root}")
    for rel in conflicts:
        print(f"UNTRACKED_RESTORE_CONFLICT={rel}")
    raise SystemExit(1)
PY
}

for i in $(seq 1 "${ATTEMPTS}"); do
  if git push origin "HEAD:${BRANCH}"; then
    exit 0
  fi

  echo "git push rejected (attempt ${i}/${ATTEMPTS}) — rebasing onto latest origin/${BRANCH}"

  backup_untracked

  if git -c rebase.autoStash=true pull --rebase -X theirs origin "${BRANCH}"; then
    restore_untracked
    cleanup_backup
    BACKUP_ROOT=""
    UNTRACKED_LIST=""
  else
    git rebase --abort || true
    restore_untracked || true
    echo "rebase failed; retrying after backoff"
  fi

  sleep $((5 * i))
done

echo "ERROR: git push still rejected after ${ATTEMPTS} attempts"
exit 1
