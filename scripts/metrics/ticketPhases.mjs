#!/usr/bin/env node
// Writes where a closed ticket's time went, docs/metrics/tickets/<n>.json (#134, docs/metrics/README.md).
// Runs on the build box, where the inputs live: GitHub through `gh`, the loop logs and the Claude
// Code transcripts. Idempotent: the same inputs rewrite the same file.
//
//   npm run metrics:ticket -- <n>      one closed ticket (the loop runs this after a close)
//   npm run metrics:backfill           every closed #90 child and perf ticket since 2026-10-05
//                                      that has transcripts, marked backfilled
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { githubWindows } from './githubWindows.mjs'
import {
  TICKET_FILES_DIR,
  serializeTicketRecord,
  shareOfSessionTime,
  ticketFileNameOf,
} from './ticketFile.mjs'
import { buildTicketRecord } from './ticketRecord.mjs'
import {
  fetchBlockers,
  fetchIssue,
  fetchTimeline,
  listBackfillTickets,
  readAttemptLogs,
  readDriverEvents,
  readTicketSessions,
} from './ticketSources.mjs'

const PLAN_ISSUE = 90
const BACKFILL_SINCE = '2026-10-05'
const OTHER_SHARE_LIMIT = 0.1
const SECONDS_PER_HOUR = 3600

function readTicketInputs(issue) {
  const timeline = fetchTimeline(issue.number)
  const attempts = readAttemptLogs(issue.number)
  const sessionIds = new Set(attempts.map((attempt) => attempt.sessionId).filter(Boolean))
  const created = Date.parse(issue.createdAt)
  const closed = Date.parse(issue.closedAt)
  return {
    issue,
    attempts,
    sessions: readTicketSessions(issue.number, sessionIds, created, closed),
    driverEvents: readDriverEvents(issue.number),
    githubWindows: githubWindows(timeline, fetchBlockers(timeline)),
  }
}

function closedIssueOf(number) {
  const issue = fetchIssue(number)
  if (issue.state !== 'closed') {
    throw new Error(`#${number} is open: its phases are written after it closes`)
  }
  return issue
}

function writeTicketFile(record) {
  mkdirSync(TICKET_FILES_DIR, { recursive: true })
  const path = join(TICKET_FILES_DIR, ticketFileNameOf(record.ticket))
  writeFileSync(path, serializeTicketRecord(record))
  return path
}

function hours(seconds) {
  return seconds === null ? '—' : `${(seconds / SECONDS_PER_HOUR).toFixed(1)} h`
}

function percent(share) {
  return share === null ? '—' : `${(share * 100).toFixed(1)}%`
}

function describeRecord(record, path) {
  const other = shareOfSessionTime([record], 'other')
  return (
    `#${record.ticket}: lead ${hours(record.lead_time_s)}, cycle ${hours(record.cycle_time_s)}, ` +
    `${record.segments.length} segments, other ${percent(other)} of session time -> ${path}`
  )
}

function writeTicket(number, backfilled) {
  const inputs = readTicketInputs(closedIssueOf(number))
  const record = buildTicketRecord({ ...inputs, backfilled })
  console.log(describeRecord(record, writeTicketFile(record)))
  return record
}

function backfillTicket(number) {
  const inputs = readTicketInputs(closedIssueOf(number))
  if (inputs.sessions.length === 0) {
    console.log(`#${number}: no transcripts, skipped`)
    return null
  }
  const record = buildTicketRecord({ ...inputs, backfilled: true })
  console.log(describeRecord(record, writeTicketFile(record)))
  return record
}

function reportOtherShare(records) {
  const share = shareOfSessionTime(records, 'other')
  const verdict = share !== null && share < OTHER_SHARE_LIMIT ? 'under' : 'NOT under'
  console.log(
    `backfill: ${records.length} tickets written; other is ${percent(share)} of session time ` +
      `(${verdict} the ${percent(OTHER_SHARE_LIMIT)} limit)`,
  )
}

function backfill() {
  const records = listBackfillTickets(PLAN_ISSUE, BACKFILL_SINCE).map(backfillTicket)
  reportOtherShare(records.filter(Boolean))
}

function ticketArgument(args) {
  const number = Number(args[0])
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error('usage: ticketPhases.mjs <ticket number> | --backfill')
  }
  return number
}

const args = process.argv.slice(2)
if (args.includes('--backfill')) backfill()
else writeTicket(ticketArgument(args), false)
