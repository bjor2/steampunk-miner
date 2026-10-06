import { describe, expect, it } from 'vitest'
import { benchmarkData, memorySampleData, runEventLine, sessionFilesOf } from './sessionFixtures'
import { sessionRowsOf, sessionTableOf, startOfRunId } from './sessionTable'

const SHA = 'f199553763288d8c240d432d65c764c26bcf75e9'
const BENCH_RUN = 'run_2026-10-06_22-39-41_bench-ground'
const GAME_RUN = 'run_2026-10-05_08-00-00'

function gameStarted(runId: string, buildCommit: string) {
  return runEventLine(runId, 0, { tick: 0 }, 'game_started', {
    gameVersion: '0.1.0',
    buildCommit,
    platform: 'browser',
    debug: true,
  })
}

function memoryLine(runId: string, seq: number, tick: number) {
  return runEventLine(
    runId,
    seq,
    { tick },
    'memory_sample',
    memorySampleData({ elapsedS: tick / 60, heapKB: 50_000 }),
  )
}

describe('session table', () => {
  it('keys a CI bench session by the commit it measured and the workflow of its artifact', () => {
    const folder = `sessions/ci/session-ci-${SHA}-37541968553/${BENCH_RUN}`
    const line = runEventLine(BENCH_RUN, 0, { tick: 0 }, 'benchmark_result', {
      ...benchmarkData('groundDrilling.carve', 2000, SHA),
    })
    const [session] = sessionTableOf([sessionFilesOf(folder, [line])]).sessions
    expect(session).toMatchObject({
      runId: BENCH_RUN,
      commit: 'f199553',
      source: 'ci',
      startedAtMs: Date.UTC(2026, 9, 6, 22, 39, 41),
    })
  })

  it('takes the commit of a game session from its metadata, then from game_started', () => {
    const lines = [gameStarted(GAME_RUN, 'abc1234')]
    const fromMetadata = sessionFilesOf('logs/a', lines, { buildCommit: '9e8d7c6', worldSeed: 7 })
    const fromStart = sessionFilesOf('logs/b', lines)
    const [first, second] = sessionTableOf([fromMetadata, fromStart]).sessions
    expect([first.commit, first.worldSeed, first.source]).toEqual(['9e8d7c6', 7, 'local'])
    expect([second.commit, second.worldSeed]).toEqual(['abc1234', null])
  })

  it('names the commit unknown when neither the run nor its folder says it', () => {
    const files = sessionFilesOf('logs/x', [memoryLine(GAME_RUN, 0, 600)])
    expect(sessionTableOf([files]).sessions[0].commit).toBe('unknown')
  })

  it('ignores one final line a crash cut off, as decision #11 tells a reader to', () => {
    const files = sessionFilesOf('logs/a', [gameStarted(GAME_RUN, 'abc1234')])
    const cut = { ...files, eventsText: `${files.eventsText}{"v":2,"seq":1,"ti` }
    const table = sessionTableOf([cut])
    expect(table.refused).toEqual([])
    expect(table.sessions[0].events).toHaveLength(1)
  })

  it('refuses a session with a malformed line inside it, never trimming it', () => {
    const files = sessionFilesOf('logs/a', [gameStarted(GAME_RUN, 'abc1234')])
    const broken = { ...files, eventsText: `not json\n${files.eventsText}` }
    const table = sessionTableOf([broken])
    expect(table.sessions).toEqual([])
    expect(table.refused[0].folder).toBe('logs/a')
    expect(table.refused[0].problems[0]).toMatch(/^unreadable line/)
  })

  it('refuses a session written under another logSchemaVersion, as compareRuns does', () => {
    const oldLine = { ...memoryLine(GAME_RUN, 0, 600), v: 1 }
    const table = sessionTableOf([sessionFilesOf('logs/old', [oldLine])])
    expect(table.sessions).toEqual([])
    expect(table.refused[0].problems).toEqual([
      'logSchemaVersion 1, this analysis reads 2; no adapter exists between them',
    ])
  })

  it('refuses an empty events file', () => {
    expect(sessionTableOf([sessionFilesOf('logs/empty', [])]).refused[0].problems).toEqual([
      'no events',
    ])
  })

  it("orders sessions by start and each session by seq, the log's own order", () => {
    const later = sessionFilesOf('logs/later', [memoryLine('run_2026-10-06_00-00-00', 0, 60)])
    const earlier = sessionFilesOf('logs/earlier', [
      memoryLine(GAME_RUN, 2, 1200),
      memoryLine(GAME_RUN, 1, 600),
    ])
    const table = sessionTableOf([later, earlier])
    expect(table.sessions.map((session) => session.folder)).toEqual(['logs/earlier', 'logs/later'])
    expect(table.sessions[0].events.map((event) => event.seq)).toEqual([1, 2])
  })

  it('flattens to one row per event, keyed by commit, run id and tick', () => {
    const table = sessionTableOf([
      sessionFilesOf('logs/a', [gameStarted(GAME_RUN, 'abc1234'), memoryLine(GAME_RUN, 1, 600)]),
    ])
    expect(
      sessionRowsOf(table).map(({ commit, runId, tick, event }) => [commit, runId, tick, event]),
    ).toEqual([
      ['abc1234', GAME_RUN, 0, 'game_started'],
      ['abc1234', GAME_RUN, 600, 'memory_sample'],
    ])
  })

  it('reads no start from a run id createRunId did not make', () => {
    expect(startOfRunId('bench-ground')).toBeNull()
  })
})
