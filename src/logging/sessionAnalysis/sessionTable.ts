/**
 * The session table of the analysis loop (#125, logging strategy section 6 step 2): every
 * collected `events.ndjson` read into one table keyed by commit, run id and tick, so heap, frame and
 * bench numbers of CI artifacts and manual sessions line up.
 *
 * A session is read the way decision #11 tells a consumer to: one truncated final line is ignored
 * (crash safety), unknown events and fields are kept and never looked at, and a log written under
 * another `logSchemaVersion` is refused whole, as `compareRuns` refuses it, since no adapter exists.
 * Any other bad line refuses the session too: refused, never trimmed.
 */
import { parseNdjson } from '../ndjson'
import { LOG_SCHEMA_VERSION, type RunEvent } from '../runEvent'

/** One session folder as the collector found it on disk. */
export interface SessionFiles {
  /** The folder holding `events.ndjson`, as the report names it. */
  folder: string
  eventsText: string
  /** `metadata.json`'s text; bench folders and exported browser sessions have none. */
  metadataText: string | null
}

export interface SessionLog {
  runId: string
  /** The build the session ran, shortened to 7 characters; `unknown` when nothing names it. */
  commit: string
  /** `ci` for a CI artifact `session-ci-<sha>-<id>` (the workflow's name), else `local`. */
  source: string
  /** When the run started, read from its run id (`run_YYYY-MM-DD_HH-MM-SS`, UTC); ms since 1970. */
  startedAtMs: number | null
  worldSeed: number | null
  folder: string
  /** In the log's own order: `seq`, strictly increasing per run (#11 section 1). */
  events: RunEvent[]
}

export interface RefusedSession {
  folder: string
  problems: string[]
}

export interface SessionTable {
  /** Oldest start first; sessions with no readable start last, by run id. */
  sessions: SessionLog[]
  refused: RefusedSession[]
}

/** One line of the flat table: an event and the commit and source of its session. */
export interface SessionRow {
  commit: string
  source: string
  runId: string
  tick: number
  seq: number
  planet: number
  depthTiles: number
  event: string
  data: unknown
}

type SessionReading = { ok: true; session: SessionLog } | { ok: false; refused: RefusedSession }

const SHORT_COMMIT_LENGTH = 7
const UNKNOWN_COMMIT = 'unknown'
/** `session-<workflow>-<40-hex sha>-<run id>` (strategy section 5, as #124's CI job names it). */
const ARTIFACT_FOLDER = /(?:^|[/\\])session-([a-z0-9-]+?)-([0-9a-f]{40})-\d+(?:[/\\]|$)/
const RUN_ID_START = /^run_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/

export function sessionTableOf(files: readonly SessionFiles[]): SessionTable {
  const readings = files.map(readSession)
  return {
    sessions: readings.flatMap((reading) => (reading.ok ? [reading.session] : [])).sort(byStart),
    refused: readings.flatMap((reading) => (reading.ok ? [] : [reading.refused])),
  }
}

function readSession(files: SessionFiles): SessionReading {
  const lines = readEventLines(files.eventsText)
  const problems = [...lines.problems, ...schemaVersionProblems(lines.events)]
  if (problems.length > 0) return { ok: false, refused: { folder: files.folder, problems } }
  return { ok: true, session: sessionLogOf(files, lines.events) }
}

/** Every whole line parsed; a final line cut off by a crash (no newline, no JSON) is dropped. */
export function readEventLines(text: string): { events: RunEvent[]; problems: string[] } {
  const whole = withoutTruncatedTail(text)
  try {
    const events = parseNdjson(whole)
    return events.length > 0 ? { events, problems: [] } : { events, problems: ['no events'] }
  } catch (error) {
    return { events: [], problems: [`unreadable line: ${(error as Error).message}`] }
  }
}

function withoutTruncatedTail(text: string): string {
  if (text.endsWith('\n')) return text
  const lastLineStart = text.lastIndexOf('\n') + 1
  return isJsonLine(text.slice(lastLineStart)) ? text : text.slice(0, lastLineStart)
}

function isJsonLine(line: string): boolean {
  try {
    JSON.parse(line)
    return true
  } catch {
    return false
  }
}

function schemaVersionProblems(events: readonly RunEvent[]): string[] {
  const versions = [...new Set(events.map((event) => event.v as number))]
  return versions
    .filter((version) => version !== LOG_SCHEMA_VERSION)
    .map(
      (version) =>
        `logSchemaVersion ${version}, this analysis reads ${LOG_SCHEMA_VERSION}; ` +
        'no adapter exists between them',
    )
}

function sessionLogOf(files: SessionFiles, events: RunEvent[]): SessionLog {
  const metadata = parseMetadata(files.metadataText)
  const runId = events[0].runId
  return {
    runId,
    commit: shortCommit(commitOfSession(files.folder, events, metadata)),
    source: sourceOfFolder(files.folder),
    startedAtMs: startOfRunId(runId),
    worldSeed: typeof metadata.worldSeed === 'number' ? metadata.worldSeed : null,
    folder: files.folder,
    events: [...events].sort(bySeq),
  }
}

interface MetadataFields {
  buildCommit?: unknown
  worldSeed?: unknown
}

function parseMetadata(text: string | null): MetadataFields {
  if (text === null) return {}
  try {
    return JSON.parse(text) as MetadataFields
  } catch {
    return {}
  }
}

/** The commit the run says it built, else the one its bench measured, else its artifact's. */
function commitOfSession(folder: string, events: readonly RunEvent[], metadata: MetadataFields) {
  const named = [
    metadata.buildCommit,
    events.find((event) => event.event === 'game_started')?.data,
    events.find((event) => event.event === 'benchmark_result')?.data,
  ].map(commitNamedBy)
  return named.find(isKnownCommit) ?? ARTIFACT_FOLDER.exec(folder)?.[2] ?? UNKNOWN_COMMIT
}

function commitNamedBy(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  const fields = value as { buildCommit?: unknown; commit?: unknown } | undefined
  const commit = fields?.buildCommit ?? fields?.commit
  return typeof commit === 'string' ? commit : undefined
}

function isKnownCommit(commit: string | undefined): commit is string {
  return commit !== undefined && commit !== '' && commit !== UNKNOWN_COMMIT
}

function shortCommit(commit: string): string {
  return commit === UNKNOWN_COMMIT ? commit : commit.slice(0, SHORT_COMMIT_LENGTH)
}

export function sourceOfFolder(folder: string): string {
  return ARTIFACT_FOLDER.exec(folder)?.[1] ?? 'local'
}

/** `createRunId`'s UTC stamp read back; null for an id it did not make. */
export function startOfRunId(runId: string): number | null {
  const parts = RUN_ID_START.exec(runId)
  if (parts === null) return null
  const [year, month, day, hour, minute, second] = parts.slice(1).map((part) => parseInt(part, 10))
  return Date.UTC(year, month - 1, day, hour, minute, second)
}

function byStart(a: SessionLog, b: SessionLog): number {
  const startOrder =
    (a.startedAtMs ?? Number.MAX_SAFE_INTEGER) - (b.startedAtMs ?? Number.MAX_SAFE_INTEGER)
  return startOrder || a.runId.localeCompare(b.runId)
}

function bySeq(a: RunEvent, b: RunEvent): number {
  return a.seq - b.seq
}

/** The table as flat rows, one per event: what `sessions.ndjson` holds for ad hoc queries. */
export function sessionRowsOf(table: SessionTable): SessionRow[] {
  return table.sessions.flatMap((session) => session.events.map((event) => rowOf(session, event)))
}

function rowOf(session: SessionLog, event: RunEvent): SessionRow {
  return {
    commit: session.commit,
    source: session.source,
    runId: session.runId,
    tick: event.tick,
    seq: event.seq,
    planet: event.planet,
    depthTiles: event.depthTiles,
    event: event.event,
    data: event.data,
  }
}

/** The events of one name in a session, typed by that name. */
export function eventsNamed<N extends RunEvent['event']>(
  session: SessionLog,
  name: N,
): RunEvent<N>[] {
  return session.events.filter((event): event is RunEvent<N> => event.event === name)
}
