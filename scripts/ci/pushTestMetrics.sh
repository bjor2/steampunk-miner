#!/usr/bin/env bash
# Appends this CI run's test metrics to the orphan `test-metrics` branch (called by
# .github/workflows/record-test-metrics.yml; the record itself is scripts/ci/recordTestRun.mjs).
#
# Never force-pushes. When the push is rejected because another run got there first, it fetches
# the new tip, writes this run's record and the rebuilt summary.json again on top of it, and
# retries: the run files never collide, and summary.json is always rebuilt from them. Always exits
# 0, so metrics can never fail CI.
set -uo pipefail

BRANCH="${METRICS_BRANCH:-test-metrics}"
export METRICS_DIR="${METRICS_DIR:-${RUNNER_TEMP:-/tmp}/test-metrics}"
REPO_ROOT=$(pwd)
ATTEMPTS=5

warn() {
  echo "::warning::test metrics not recorded: $1"
  exit 0
}

check_out_branch_tip() {
  git worktree remove --force "$METRICS_DIR" >/dev/null 2>&1
  rm -rf "$METRICS_DIR"
  git worktree prune
  if git fetch --quiet --depth=1 origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH" 2>/dev/null; then
    git worktree add --quiet --detach "$METRICS_DIR" "origin/$BRANCH"
  else
    echo "No $BRANCH branch yet; starting it as an orphan."
    git worktree add --quiet --detach "$METRICS_DIR" HEAD &&
      git -C "$METRICS_DIR" checkout --quiet --orphan "$BRANCH" &&
      git -C "$METRICS_DIR" rm -rfq --ignore-unmatch . &&
      printf '%s\n' "# test-metrics" "" "CI test timings and results, written by scripts/ci/recordTestRun.mjs." \
        "Schema: docs/metrics/test-metrics.md on main. Never edit by hand." >"$METRICS_DIR/README.md"
  fi
}

commit_record() {
  git -C "$METRICS_DIR" add -- summary.json runs &&
    { [ ! -f "$METRICS_DIR/README.md" ] || git -C "$METRICS_DIR" add -- README.md; } &&
    git -C "$METRICS_DIR" -c user.name='github-actions[bot]' \
      -c user.email='41898599+github-actions[bot]@users.noreply.github.com' \
      commit --quiet -m "Record test metrics of run ${GITHUB_RUN_ID:-local} (${TEST_MODE:-unknown}) [skip ci]"
}

for attempt in $(seq 1 "$ATTEMPTS"); do
  check_out_branch_tip || warn "could not check out $BRANCH"
  node "$REPO_ROOT/scripts/ci/recordTestRun.mjs" || warn "recordTestRun.mjs failed"
  commit_record || warn "nothing to commit"
  if git -C "$METRICS_DIR" push --quiet origin "HEAD:refs/heads/$BRANCH"; then
    echo "Pushed to $BRANCH (attempt $attempt)."
    exit 0
  fi
  echo "Push to $BRANCH rejected (attempt $attempt); rewriting on the new tip."
  sleep $((attempt * 3))
done
warn "push to $BRANCH rejected $ATTEMPTS times"
