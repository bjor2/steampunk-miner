/**
 * The session analysis pass (#125, logging strategy section 6): collects run logs, normalizes
 * every `events.ndjson` into one table keyed by commit, run id and tick, and writes the report.
 * Report only: it never fails on a finding and never opens or edits an issue; scheduling the daily
 * pass is done by hand on the box.
 *
 *   npm run perf:sessions -- [--sessions <dir>]... [--download <n>] [--out <dir>]
 *
 * --sessions  a folder of session folders, searched to any depth (default `logs`, where local
 *             runs and `bench:* -- --log` write); repeat it for several
 * --download  first pull the newest <n> CI `session-*` artifacts (`gh run download`) into
 *             `<first --sessions>/ci/`, skipping ones already there
 * --out       where `report.html`, `summary.txt` and `sessions.ndjson` go
 *             (default `test-results/session-analysis`)
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadFeatures } from '../../src/features'
import { formatNdjsonLine } from '../../src/logging/ndjson'
import {
  analyzeSessions,
  formatAnalysisSummary,
  type SessionAnalysis,
} from '../../src/logging/sessionAnalysis/sessionAnalysis'
import { renderSessionReportHtml } from '../../src/logging/sessionAnalysis/sessionReportHtml'
import {
  sessionRowsOf,
  sessionTableOf,
  type SessionTable,
} from '../../src/logging/sessionAnalysis/sessionTable'
import { readSessionFolders } from './sessionFolders'

interface Options {
  sessions: string[]
  download: number
  out: string
}

/** The artifacts API returns at most 100 a page, newest first; one page is the cap. */
const MAX_DOWNLOADS = 100

function readOptions(argv: readonly string[]): Options {
  const options: Options = { sessions: [], download: 0, out: 'test-results/session-analysis' }
  for (let at = 0; at < argv.length; at += 2) {
    const [flag, value] = [argv[at], argv[at + 1]]
    if (value === undefined) failWith(`${flag} needs a value`)
    if (flag === '--sessions') options.sessions.push(value)
    else if (flag === '--download') options.download = parseInt(value, 10)
    else if (flag === '--out') options.out = value
    else failWith(`unknown option ${flag}`)
  }
  if (!(options.download >= 0 && options.download <= MAX_DOWNLOADS))
    failWith(`--download must be 0 to ${MAX_DOWNLOADS}`)
  return { ...options, sessions: options.sessions.length > 0 ? options.sessions : ['logs'] }
}

function failWith(problem: string): never {
  console.error(problem)
  process.exit(1)
}

interface Artifact {
  name: string
  expired: boolean
  workflow_run: { id: number }
}

function downloadNewestSessionArtifacts(count: number, folder: string): void {
  const listed = execFileSync(
    'gh',
    ['api', `repos/{owner}/{repo}/actions/artifacts?per_page=${MAX_DOWNLOADS}`],
    { encoding: 'utf8' },
  )
  const artifacts = (JSON.parse(listed) as { artifacts: Artifact[] }).artifacts
    .filter((artifact) => artifact.name.startsWith('session-') && !artifact.expired)
    .slice(0, count)
  for (const artifact of artifacts) downloadArtifact(artifact, join(folder, artifact.name))
}

function downloadArtifact(artifact: Artifact, target: string): void {
  if (existsSync(target)) return
  const runId = String(artifact.workflow_run.id)
  execFileSync('gh', ['run', 'download', runId, '--name', artifact.name, '--dir', target], {
    stdio: 'inherit',
  })
  console.error(`downloaded ${artifact.name}`)
}

function writeReport(out: string, table: SessionTable, analysis: SessionAnalysis): string {
  const summary = formatAnalysisSummary(analysis)
  mkdirSync(out, { recursive: true })
  writeFileSync(
    join(out, 'report.html'),
    renderSessionReportHtml(analysis, new Date().toISOString()),
  )
  writeFileSync(join(out, 'summary.txt'), `${summary}\n`)
  writeFileSync(join(out, 'sessions.ndjson'), sessionRowsOf(table).map(formatNdjsonLine).join(''))
  return summary
}

loadFeatures()
const options = readOptions(process.argv.slice(2))
if (options.download > 0)
  downloadNewestSessionArtifacts(options.download, join(options.sessions[0], 'ci'))
const files = options.sessions.flatMap(readSessionFolders)
if (files.length === 0) failWith(`no events.ndjson under ${options.sessions.join(', ')}`)
const table = sessionTableOf(files)
console.log(writeReport(options.out, table, analyzeSessions(table)))
console.error(`report: ${join(options.out, 'report.html')}`)
