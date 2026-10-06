// Where `npm run metrics:ticket` reads a ticket's inputs on the build box (#134): GitHub through the
// logged-in `gh` CLI, the loop logs, and the Claude Code transcripts. Everything here is I/O; the
// rules that turn the inputs into a ticket file are the pure modules beside it.
import { execFileSync } from 'node:child_process'
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { blockerNumbersOf } from './githubWindows.mjs'
import { parseDriverLog } from './loopLog.mjs'
import { segmentSession } from './sessionSegments.mjs'

export const REPO = process.env.GITHUB_REPOSITORY || 'bjor2/steampunk-miner'
export const LOOP_LOG_DIRS = (
  process.env.METRICS_LOOP_LOGS ||
  '/workspace/claude-sessions/steampunk-loop/logs:/workspace/claude-sessions/perf-loop/logs'
).split(':')
export const PROJECTS_DIR =
  process.env.METRICS_CLAUDE_PROJECTS || join(homedir(), '.claude', 'projects')
// The transcript folders of the loop worktrees and the main clone (`~/.claude/projects/*<worktree>*`).
const TRANSCRIPT_DIR_NAME = /steampunk-loop-worktrees|perf-loop-worktrees|-steampunk-miner$/
const SESSION_LOG_NAME = /^(\d+)-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.log$/
const BRANCH_PROBE_BYTES = 256 * 1024
const FIRST_LINE_MAX_BYTES = 4 * 1024 * 1024
const GITHUB_PAGE = 100

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 256 << 20,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function ndjsonOf(text) {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line))
}

/** `{ number, title, state, createdAt, closedAt, labels: [name] }` of one issue. */
export function fetchIssue(number) {
  const issue = JSON.parse(gh(['api', `repos/${REPO}/issues/${number}`]))
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    createdAt: issue.created_at,
    closedAt: issue.closed_at,
    labels: issue.labels.map((label) => label.name),
  }
}

/** The timeline events the phases read: labels and blocked_by dependencies. */
export function fetchTimeline(number) {
  const jq =
    '.[] | {event, created_at, label: (if .label then {name: .label.name} else null end),' +
    ' blocked_by: (if .blocked_by then {number: .blocked_by.number} else null end)}'
  const path = `repos/${REPO}/issues/${number}/timeline?per_page=${GITHUB_PAGE}`
  return ndjsonOf(gh(['api', path, '--paginate', '--jq', jq]))
}

/** Map of each blocking issue named in the timeline -> `{ createdAt, closedAt }`. */
export function fetchBlockers(timeline) {
  return new Map(
    blockerNumbersOf(timeline).map((number) => {
      const issue = fetchIssue(number)
      return [number, { createdAt: issue.createdAt, closedAt: issue.closedAt }]
    }),
  )
}

/** The backfill set: closed sub-issues of the build plan and closed `perf` issues, since `since`. */
export function listBackfillTickets(planIssue, since) {
  const jq = `.[] | select(.state == "closed" and .closed_at >= "${since}") | .number`
  const children = gh([
    'api',
    `repos/${REPO}/issues/${planIssue}/sub_issues?per_page=${GITHUB_PAGE}`,
    '--paginate',
    '--jq',
    jq,
  ])
  const perf = gh([
    'api',
    `repos/${REPO}/issues?labels=perf&state=closed&per_page=${GITHUB_PAGE}`,
    '--paginate',
    '--jq',
    jq,
  ])
  const numbers = `${children}\n${perf}`.split('\n').filter(Boolean).map(Number)
  return [...new Set(numbers)].sort((a, b) => a - b)
}

/** The driver events of `ticket` from every loop's driver.log. */
export function readDriverEvents(ticket) {
  return LOOP_LOG_DIRS.map((dir) => join(dir, 'driver.log'))
    .filter(existsSync)
    .flatMap((path) => parseDriverLog(readFileSync(path, 'utf8')))
    .filter((event) => event.ticket === ticket)
    .sort((a, b) => a.at - b.at)
}

function readFirstLine(path) {
  const fd = openSync(path, 'r')
  try {
    const buffer = Buffer.alloc(Math.min(FIRST_LINE_MAX_BYTES, statSync(path).size))
    const read = readSync(fd, buffer, 0, buffer.length, 0)
    return buffer.subarray(0, read).toString('utf8').split('\n')[0]
  } finally {
    closeSync(fd)
  }
}

function sessionIdOfLog(path) {
  try {
    return JSON.parse(readFirstLine(path)).session_id ?? null
  } catch {
    return null
  }
}

// The loops name a session log by the box's wall clock (Europe/Oslo), so it is read as local time.
function startOfLogName(match) {
  const [, , year, month, day, hour, minute, second] = match.map(Number)
  return new Date(year, month - 1, day, hour, minute, second).getTime()
}

function gatesEndOf(dir, logName) {
  const ends = readdirSync(dir)
    .filter((name) => name.startsWith(`${logName}.gates`))
    .map((name) => statSync(join(dir, name)).mtimeMs)
  return ends.length ? Math.round(Math.max(...ends)) : null
}

function attemptOfLog(dir, name, match) {
  const path = join(dir, name)
  return {
    start: startOfLogName(match),
    end: Math.round(statSync(path).mtimeMs),
    gatesEnd: gatesEndOf(dir, name),
    sessionId: sessionIdOfLog(path),
  }
}

/** One attempt per `logs/<ticket>-<stamp>.log` session log, in both loops. */
export function readAttemptLogs(ticket) {
  return LOOP_LOG_DIRS.filter(existsSync).flatMap((dir) =>
    readdirSync(dir)
      .map((name) => [name, SESSION_LOG_NAME.exec(name)])
      .filter(([, match]) => match && Number(match[1]) === ticket)
      .map(([name, match]) => attemptOfLog(dir, name, match)),
  )
}

function transcriptPaths() {
  if (!existsSync(PROJECTS_DIR)) return []
  return readdirSync(PROJECTS_DIR)
    .filter((name) => TRANSCRIPT_DIR_NAME.test(name))
    .flatMap((dir) =>
      readdirSync(join(PROJECTS_DIR, dir))
        .filter((name) => name.endsWith('.jsonl'))
        .map((name) => join(PROJECTS_DIR, dir, name)),
    )
}

function firstBranchOf(path) {
  const fd = openSync(path, 'r')
  try {
    const buffer = Buffer.alloc(BRANCH_PROBE_BYTES)
    const read = readSync(fd, buffer, 0, buffer.length, 0)
    return /"gitBranch":"([^"]*)"/.exec(buffer.subarray(0, read).toString('utf8'))?.[1] ?? null
  } finally {
    closeSync(fd)
  }
}

function isTicketTranscript(path, ticket, sessionIds) {
  const sessionId = path.slice(path.lastIndexOf('/') + 1, -'.jsonl'.length)
  if (sessionIds.has(sessionId)) return true
  const branch = firstBranchOf(path)
  return branch === `ticket/${ticket}` || branch === `perf/${ticket}`
}

function readTranscript(path) {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .flatMap((line) => {
      try {
        return [JSON.parse(line)]
      } catch {
        return []
      }
    })
}

/**
 * The ticket's sessions as `segmentSession` results: the transcripts the session logs name, and
 * any other transcript started on the ticket's branch between its creation and its close.
 */
export function readTicketSessions(ticket, sessionIds, created, closed) {
  return transcriptPaths()
    .filter((path) => isTicketTranscript(path, ticket, sessionIds))
    .map((path) => segmentSession(readTranscript(path)))
    .filter(
      (session) => session.start !== null && session.start >= created && session.start < closed,
    )
}
