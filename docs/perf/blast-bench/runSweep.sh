#!/usr/bin/env bash
# #154 sweep driver: radii interleaved (order rotated each run), N runs, machine load recorded
# before and after every process. Usage: runSweep.sh <worktree> <outdir> [runs] [radii...]
set -euo pipefail
WT=$1; OUT=$2; RUNS=${3:-5}; shift 3 || true
RADII=("$@"); [ ${#RADII[@]} -eq 0 ] && RADII=(2.5 4 8 13 16 21 32)
mkdir -p "$OUT"
cd "$WT"
SHA=$(git rev-parse HEAD)
echo "{\"sha\":\"$SHA\",\"nproc\":$(nproc),\"cpu\":\"$(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2 | xargs)\",\"node\":\"$(node -v)\",\"started\":\"$(date -Iseconds)\"}" > "$OUT/meta.json"
for run in $(seq 1 "$RUNS"); do
  n=${#RADII[@]}
  for i in $(seq 0 $((n-1))); do
    R=${RADII[$(( (i + run - 1) % n ))]}
    load0=$(cut -d' ' -f1-3 /proc/loadavg)
    busy=$(ps -eo pcpu=,comm= --sort=-pcpu | awk '$1>20{printf "%s:%s ", $2, $1}')
    t0=$(date -Iseconds)
    line=$(BLAST_R=$R node --expose-gc node_modules/vite-node/vite-node.mjs scripts/benchBlast.ts)
    load1=$(cut -d' ' -f1-3 /proc/loadavg)
    echo "{\"run\":$run,\"radius\":$R,\"at\":\"$t0\",\"loadBefore\":\"$load0\",\"loadAfter\":\"$load1\",\"busy\":\"$busy\",\"result\":$line}" >> "$OUT/sweep.jsonl"
    echo "run $run R=$R load $load0 -> $load1"
  done
done
echo done
