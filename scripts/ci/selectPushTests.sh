#!/usr/bin/env bash
# Picks the Vitest run for the per-push CI job (verify in .github/workflows/ci.yml).
#
#   scripts/ci/selectPushTests.sh <base-sha-or-empty>
#
# Writes mode=scoped|full|none, balance=true|false and reason=... to $GITHUB_OUTPUT (stdout when
# unset), and the files for `vitest related` to $RELATED_LIST (default: vitest-related.txt).
# scoped: Vitest follows the import graph from these files to the tests that import them.
# full:   a change Vitest cannot map (config, setup, golden and balance data, CI itself) or no
#         usable base; the whole suite runs, minus the nightly-only tests of vite.config.ts.
# none:   nothing changed that a test reads.
# The nightly workflow always runs the true full suite (`npm test`), so a miss here surfaces there.
set -euo pipefail

BASE="${1:-}"
OUT="${GITHUB_OUTPUT:-/dev/stdout}"
RELATED_LIST="${RELATED_LIST:-vitest-related.txt}"
: >"$RELATED_LIST"

# Changes Vitest's import graph cannot see, or that change every test: run the whole suite.
FULL_SUITE_PATHS='^(package\.json|package-lock\.json|(vite|vitest)\.config\.[^/]+|tsconfig[^/]*\.json|eslint\.config\.[^/]+|src/testSetup\.ts|\.github/workflows/ci\.yml|scripts/ci/.*|tests/.*)$'

# The balance report's inputs; anything else skips `npm run balance:report` on a scoped push.
BALANCE_PATHS='^(src/systems/economy/|src/data/|src/logging/|scripts/balanceReport\.ts$|tests/balance/|scenarios/)'

# Tests that read their inputs with node:fs (not import), so the import graph misses them.
# Each line: <path regex> <test files...>
FS_READ_RULES=$(
  cat <<'RULES'
^src/.*\.(ts|tsx)$ src/systems/economy/economySourceScan.test.ts src/systems/vehicle/vehicleStats.test.ts src/systems/authority/moneyRounding.test.ts
^(src/systems/(world|replay|authority)/|src/systems/money|src/logging/) src/logging/goldenRun.test.ts src/logging/secondSliceGolden.test.ts src/systems/world/generatorGolden.test.ts
^scenarios/ src/systems/scenario.test.ts src/debug/debugApi.test.ts
^docs/economy/ src/systems/economy/economyTables.test.ts
^docs/features/features\.json$ scripts/status/features.test.mjs
^(public/assets|src/ui/icons)/ src/systems/art/assetLint.test.ts
RULES
)

write_choice() {
  {
    echo "mode=$1"
    echo "balance=$2"
    echo "reason=$3"
  } >>"$OUT"
  echo "Vitest mode: $1 ($3)"
  echo "Balance report: $([ "$2" = true ] && echo run || echo skip)"
}

has_usable_base() {
  [ -n "$BASE" ] && [ "$BASE" != 0000000000000000000000000000000000000000 ] &&
    git cat-file -e "$BASE^{commit}" 2>/dev/null
}

if ! has_usable_base; then
  write_choice full true "no usable base commit ('${BASE:-none}'), e.g. a new branch or a force push"
  exit 0
fi

CHANGED=$(git diff --name-only "$BASE"...HEAD)
echo "Changed files since ${BASE:0:12}:"
sed 's/^/  /' <<<"${CHANGED:-(none)}"

if [ -z "$CHANGED" ]; then
  write_choice none false "no files changed since ${BASE:0:12}"
  exit 0
fi

FULL_HITS=$(grep -E "$FULL_SUITE_PATHS" <<<"$CHANGED" || true)
if [ -n "$FULL_HITS" ]; then
  write_choice full true "unmappable change: $(paste -sd ' ' - <<<"$FULL_HITS")"
  exit 0
fi

echo "$CHANGED" >"$RELATED_LIST"
while read -r pattern tests; do
  if grep -qE "$pattern" <<<"$CHANGED"; then
    echo "fs-read rule $pattern adds: $tests"
    printf '%s\n' $tests >>"$RELATED_LIST"
  fi
done <<<"$FS_READ_RULES"
sort -u -o "$RELATED_LIST" "$RELATED_LIST"

BALANCE=false
if grep -qE "$BALANCE_PATHS" <<<"$CHANGED"; then BALANCE=true; fi
write_choice scoped "$BALANCE" "$(wc -l <<<"$CHANGED" | tr -d ' ') changed files, tests picked by import graph and fs-read rules"
