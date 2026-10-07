import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readSessionFolders } from '../../../scripts/perf/sessionFolders'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import type { RunEvent } from '../runEvent'
import { runEventProblems } from '../runEventSchema'
import { analyzeSessions, formatAnalysisSummary } from './sessionAnalysis'
import { renderSessionReportHtml } from './sessionReportHtml'
import { sessionTableOf } from './sessionTable'

// The committed fixture sessions, read the way `npm run perf:sessions` reads a sessions folder:
// three CI bench artifacts on three commits two days apart (generateChunk 14-15% slower on the
// third), two manual game sessions on one seed (the newer one slow twice after a metal ore, its
// geometries climbing, its last line cut off by a crash) and one session of an older log schema.
const FIXTURES = fileURLToPath(new URL('./fixtures/sessions', import.meta.url))

function fixtureTable() {
  return sessionTableOf(readSessionFolders(FIXTURES))
}

/** A probe slice counting each planet's resource_collected lines (#223). */
const unitsReport: SliceDefinition = {
  id: 'probe',
  register: (r) =>
    r.reportRows({
      id: 'probe.units',
      rowsOf: (events, _worldSeed, planet) => [
        { label: 'units collected', value: String(unitsCollectedOn(events, planet)) },
      ],
    }),
}

function unitsCollectedOn(events: readonly RunEvent[], planet: number): number {
  return events.filter((event) => event.planet === planet && event.event === 'resource_collected')
    .length
}

describe('session analysis on the fixture sessions', () => {
  it('reads every run folder, refusing only the one from an older log schema', () => {
    const table = fixtureTable()
    expect(table.sessions).toHaveLength(8)
    expect(table.refused).toHaveLength(1)
    expect(table.refused[0].folder).toMatch(/run_2026-09-01_12-00-00$/)
    expect(table.sessions.flatMap((session) => session.events).flatMap(runEventProblems)).toEqual(
      [],
    )
  })

  it('keys the CI folders by their artifact and the manual ones by their metadata', () => {
    const keys = fixtureTable().sessions.map(({ source, commit }) => `${source} ${commit}`)
    expect(new Set(keys)).toEqual(
      new Set(['ci aaaaaaa', 'ci bbbbbbb', 'ci ccccccc', 'local bbbbbbb', 'local ccccccc']),
    )
  })

  it('flags the slower generateChunk on the third commit and leaves the carve alone', () => {
    const flagged = analyzeSessions(fixtureTable()).benchTrend.filter((row) => row.isRegression)
    expect(flagged.map(({ series, commit }) => `${series} ${commit}`)).toEqual([
      'generateChunk p1 ccccccc',
      'generateChunk p2 ccccccc',
    ])
  })

  it('finds the climbing geometries, the two slowdowns and the ore before them', () => {
    const analysis = analyzeSessions(fixtureTable())
    const climbing = analysis.countTrends.filter((trend) => trend.isClimbing)
    expect(climbing.map(({ runId, count }) => `${runId} ${count}`)).toEqual([
      'run_2026-10-06_12-00-00 geometries',
    ])
    expect(analysis.slowdowns.map((stretch) => stretch.seconds)).toEqual([4, 1])
    expect(analysis.longTaskBursts).toHaveLength(1)
    expect(analysis.slowdownsByOre).toEqual([['kernel.metal.t1', 2]])
  })

  it('grows the heap faster per mineral in the newer manual session', () => {
    const [older, newer] = analyzeSessions(fixtureTable()).heapTrends
    expect(newer.mbPer100Minerals).toBeGreaterThan(older.mbPer100Minerals ?? Infinity)
  })

  it('compares the two manual sessions of one seed across their commits', () => {
    const [comparison] = analyzeSessions(fixtureTable()).comparisons
    expect([comparison.before.commit, comparison.after.commit]).toEqual(['bbbbbbb', 'ccccccc'])
    expect(comparison.comparison.ok).toBe(true)
  })

  it('writes the summary and a page with every section and a chart per charted session', () => {
    const analysis = analyzeSessions(fixtureTable())
    expect(formatAnalysisSummary(analysis).split('\n')[0]).toBe(
      'Sessions: 8 (6 ci, 2 local) on 3 commit(s), 1 refused',
    )
    const page = renderSessionReportHtml(analysis, '2026-10-07T00:00:00Z')
    for (const id of [
      'sessions',
      'heap',
      'counts',
      'frames',
      'stretches',
      'mined-order',
      'bench',
      'summaries',
    ])
      expect(page).toContain(`<section id="${id}">`)
    expect(page.match(/<svg /g)).toHaveLength(4)
  })

  it("prints a slice's registered report row for each run log with a world seed (#223)", () => {
    const { analysis, page } = withRegistrations([unitsReport], () => {
      const analyzed = analyzeSessions(fixtureTable())
      return { analysis: analyzed, page: renderSessionReportHtml(analyzed, '2026-10-07T00:00:00Z') }
    })
    expect(analysis.reportRows.map(({ commit, sourceId }) => `${commit} ${sourceId}`)).toEqual([
      'bbbbbbb probe.units',
      'ccccccc probe.units',
    ])
    expect(analysis.reportRows.every((row) => Number(row.value) > 0)).toBe(true)
    expect(page).toContain('<section id="report-rows">')
    expect(page).toContain('<td>probe.units</td><td>units collected</td>')
  })
})
