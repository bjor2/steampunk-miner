#!/usr/bin/env bash
# Shows that two art branches merge with no hand edits (#116 acceptance 1). From the committed
# HEAD, in a throwaway clone, two branches each add an asset the way docs/art-pipeline.md says
# (an entry file, a placeholder sidecar and the module's own art spec), with ids that sort next
# to each other, and the second is merged into the first. As a control, two branches that each
# append to one shared list must conflict, so the check can tell a clean merge from a blind one.
# Usage: npm run art:merge-check
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT

git clone --quiet "$root" "$scratch/repo"
cd "$scratch/repo"
commit() { git -c user.name=merge-check -c user.email=merge-check@localhost commit --quiet -m "$1"; }

add_asset() {
  local id="$1" module="$2"
  printf '{\n  "id": "%s",\n  "source": "blender",\n  "form": "parts",\n  "status": "placeholder",\n  "color": "#8a6a2f"\n}\n' \
    "$id" >"art/assets/$id.json"
  printf '{ "assetId": "%s", "schema": 1, "parts": [] }\n' "$id" >"art/placeholders/$id.parts.json"
  printf "import { it } from 'vitest'\n\nit('names the %s art', () => {})\n" "$module" \
    >"src/systems/art/${module}Art.test.ts"
  git add "art/assets/$id.json" "art/placeholders/$id.parts.json" "src/systems/art/${module}Art.test.ts"
}

# The old way: every asset appended its row to the end of one committed file.
append_to_shared_list() {
  printf '%s\n' "$1" >>README.md
  git add README.md
}

merge_into() {
  local into="$1" from="$2"
  git checkout --quiet "$into"
  git merge --quiet --no-edit -m "merge $from" "$from" >/dev/null 2>&1
}

base="$(git rev-parse HEAD)"

git checkout --quiet -b module-a "$base"
add_asset prop-merge-check-a mergeCheckA
commit 'Add asset a'
git checkout --quiet -b module-b "$base"
add_asset prop-merge-check-b mergeCheckB
commit 'Add asset b'

if ! merge_into module-a module-b; then
  echo "FAIL: two branches that each add an asset conflict:" >&2
  git diff --name-only --diff-filter=U >&2
  exit 1
fi
echo "ok: two branches that each add an asset merge cleanly"

git checkout --quiet -b shared-a "$base"
append_to_shared_list a
commit 'Append a'
git checkout --quiet -b shared-b "$base"
append_to_shared_list b
commit 'Append b'
if merge_into shared-a shared-b; then
  echo "FAIL: the control merged cleanly, so this check cannot see a conflict" >&2
  exit 1
fi
git merge --abort
echo "ok: the control (two appends to one shared list) conflicts, as it must"
