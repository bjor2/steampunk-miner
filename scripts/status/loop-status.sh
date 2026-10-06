#!/usr/bin/env bash
# loop-status.sh — publish one loop's state to the status dashboard
# (https://bjor2.github.io/steampunk-miner/status/). Docs: docs/loop-status.md
#
#   loop-status.sh <loop> <working|idle|paused|blocked> [--issue N] [--slot S] [--note "text"]
#                                                       [--stale-after MIN]
#   loop-status.sh <loop> --remove [--slot S]      # drop an entry
#   loop-status.sh --batch < entries.jsonl         # many entries, one commit
#        (one JSON object per line: {"loop","slot","state","issue","note",...extra fields})
#   loop-status.sh --show                          # print the published loops.json
#
# Upserts the entry <loop>[/<slot>] (with a UTC timestamp = heartbeat) in loops.json on the
# orphan branch `loop-status` via the GitHub contents API: fetch, merge, PUT with the old sha;
# on a conflict refetch and retry. Never force. A state change also asks the Pages workflow to
# rebuild (debounced). Failure-tolerant: always exits 0 and gives up after ~8 s, so a status
# publish can never break the loop that calls it.
#
# Env: LOOP_STATUS_REPO (bjor2/steampunk-miner), LOOP_STATUS_BRANCH (loop-status),
#      LOOP_STATUS_DISABLE=1 (no-op), LOOP_STATUS_NO_DISPATCH=1 (never trigger a rebuild),
#      LOOP_STATUS_BUDGET (seconds, default 8), LOOP_STATUS_QUIET=1.
set -uo pipefail

REPO="${LOOP_STATUS_REPO:-bjor2/steampunk-miner}"
BRANCH="${LOOP_STATUS_BRANCH:-loop-status}"
FILE="loops.json"
BUDGET="${LOOP_STATUS_BUDGET:-8}"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/loop-status"
mkdir -p "$CACHE" 2>/dev/null || CACHE=/tmp
LOG="$CACHE/loop-status.log"
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

usage() { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }
log() { echo "[$(date '+%F %T %Z')] $*" >>"$LOG" 2>/dev/null; [[ -n "${LOOP_STATUS_QUIET:-}" ]] || echo "loop-status: $*" >&2; }
left() { echo $((BUDGET - SECONDS)); }

[[ -n "${LOOP_STATUS_DISABLE:-}" ]] && exit 0
command -v gh >/dev/null 2>&1 && command -v jq >/dev/null 2>&1 || { log "gh or jq missing; skipped"; exit 0; }

gh_t() { local t; t=$(left); ((t < 1)) && return 124; timeout "$((t < 4 ? t : 4))" gh "$@"; }

fetch() { # -> prints JSON {sha, content} ; empty content when the file is absent
  gh_t api "repos/$REPO/contents/$FILE?ref=$BRANCH" --jq '{sha: .sha, content: .content}' 2>/dev/null
}

show() {
  gh api -H 'Accept: application/vnd.github.raw' "repos/$REPO/contents/$FILE?ref=$BRANCH"
  exit 0
}

# ---- parse args into a JSONL batch ----
BATCH=""
REMOVE=0
if [[ $# -eq 0 ]]; then usage; fi
case "$1" in
  -h|--help) usage ;;
  --show) show ;;
  --batch) BATCH=$(cat) ;;
  *)
    LOOP=$1; shift
    STATE="${1:-}"; [[ $# -gt 0 ]] && shift
    ISSUE="" SLOT="" NOTE="" STALE=""
    [[ "$STATE" == "--remove" ]] && REMOVE=1
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --issue) ISSUE="${2:-}"; shift 2 ;;
        --slot) SLOT="${2:-}"; shift 2 ;;
        --note) NOTE="${2:-}"; shift 2 ;;
        --stale-after) STALE="${2:-}"; shift 2 ;;
        --remove) REMOVE=1; shift ;;
        *) log "unknown arg: $1"; exit 0 ;;
      esac
    done
    if [[ $REMOVE -eq 0 && ! "$STATE" =~ ^(working|idle|paused|blocked)$ ]]; then
      log "state must be working|idle|paused|blocked (got '$STATE')"; exit 0
    fi
    ISSUE="${ISSUE#\#}"
    [[ -z "$ISSUE" || "$ISSUE" =~ ^[0-9]+$ ]] || { log "--issue must be a number"; exit 0; }
    BATCH=$(jq -cn --arg loop "$LOOP" --arg slot "$SLOT" --arg state "$STATE" --arg issue "$ISSUE" \
      --arg note "$NOTE" --arg stale "$STALE" --argjson remove "$REMOVE" '
      {loop: $loop, slot: (if $slot == "" then null else $slot end), state: $state,
       issue: (if $issue == "" then null else ($issue | tonumber) end),
       note: (if $note == "" then null else $note end)}
      + (if $stale == "" then {} else {stale_after_min: ($stale | tonumber)} end)
      + (if $remove == 1 then {remove: true} else {} end)')
    ;;
esac
[[ -n "$BATCH" ]] || { log "empty batch"; exit 0; }
ENTRIES=$(jq -cs '[.[] | select(type == "object" and (.loop // "") != "")]' <<<"$BATCH" 2>/dev/null) \
  || { log "bad batch JSON"; exit 0; }

# Writers on this machine queue on a local lock (no API conflicts); the budget starts once held.
{ exec 8>"$CACHE/publish.lock"; } 2>/dev/null && { flock -w 12 8 || { log "lock busy; skipped"; exit 0; }; }
SECONDS=0

NOW=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
HOST=$(hostname 2>/dev/null || echo box)

# merge(old_json) -> new loops.json ; also sets .changed (stripped before upload)
merge() {
  jq -c --argjson in "$ENTRIES" --arg now "$NOW" --arg host "$HOST" '
    def key(e): e.loop + (if (e.slot // null) == null then "" else "/" + (e.slot | tostring) end);
    (if type == "object" then . else {} end) as $o
    | reduce $in[] as $e ({doc: ($o | .entries //= {} | .events //= []), changed: false};
        key($e) as $k
        | .doc.entries[$k] as $prev
        | if ($e.remove // false) then
            (if $prev then .changed = true else . end) | del(.doc.entries[$k])
          else
            ($e | del(.remove) | .slot = (if (.slot // null) == null then null else (.slot | tostring) end)
                | .updated_at = $now | .host = $host) as $n
            | (($prev == null) or ($prev.state != $n.state) or ($prev.issue != $n.issue)) as $chg
            | .doc.entries[$k] = $n
            | if $chg then
                .changed = true
                | .doc.events = ([{at: $now, key: $k, state: $n.state, issue: $n.issue, note: $n.note}]
                                 + .doc.events)[:60]
              else . end
          end)
    | .doc + {updated_at: $now, schema: 1, changed: .changed}' <<<"$1"
}

msg_for() {
  jq -r 'if length == 1 then .[0] | "loop-status: \(.loop)\(if .slot then "/" + (.slot|tostring) else "" end) \(if .remove then "removed" else .state end)\(if .issue then " #\(.issue)" else "" end)" else "loop-status: batch of \(length) (\(map(.loop) | unique | join(", ")))" end' <<<"$ENTRIES"
}

attempt=0
while :; do
  attempt=$((attempt + 1))
  cur=$(fetch) || cur=""
  sha="" old='{}'
  [[ -n "$cur" ]] && sha=$(jq -r '.sha // empty' <<<"$cur" 2>/dev/null)
  if [[ -n "$sha" ]]; then
    old=$(jq -r '.content' <<<"$cur" | base64 -d 2>/dev/null) || old='{}'
    jq -e . >/dev/null 2>&1 <<<"$old" || old='{}'
  fi
  # (file missing or fetch failed: the PUT below decides — create, or conflict and retry)
  new=$(merge "$old") || { log "merge failed"; exit 0; }
  changed=$(jq -r '.changed' <<<"$new")
  b64=$(jq 'del(.changed)' <<<"$new" | base64 | tr -d '\n')
  body=$(jq -cn --arg msg "$(msg_for)" --arg branch "$BRANCH" --arg sha "$sha" --arg c "$b64" \
    '{message: $msg, branch: $branch, content: $c} + (if $sha == "" then {} else {sha: $sha} end)')
  if out=$(gh_t api -X PUT "repos/$REPO/contents/$FILE" --input - <<<"$body" 2>&1); then
    break
  fi
  if ((attempt >= 6 || $(left) < 2)); then
    log "publish failed after $attempt attempt(s): $(tr -s "\n" " " <<<"$out" | head -c 300)"; exit 0
  fi
  sleep "$((RANDOM % 2)).$((RANDOM % 9 + 1))"
done

[[ -n "${LOOP_STATUS_QUIET:-}" ]] || echo "loop-status: published $(msg_for | sed 's/^loop-status: //')" >&2

# A state change asks the Pages workflow for a rebuild (at most once per 90 s, in the background).
# Heartbeats alone do not: the page reads loops.json live and computes staleness itself.
if [[ "$changed" == "true" && -z "${LOOP_STATUS_NO_DISPATCH:-}" ]]; then
  stamp="$CACHE/last-dispatch"
  last=$(cat "$stamp" 2>/dev/null || echo 0)
  if (($(date +%s) - last > 90)); then
    date +%s >"$stamp" 2>/dev/null
    (timeout 8 gh workflow run pages.yml -R "$REPO" --ref main >/dev/null 2>>"$LOG" &) 2>/dev/null
  fi
fi
exit 0
