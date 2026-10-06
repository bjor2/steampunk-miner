import { describe, expect, it } from 'vitest'
import { runEventLine, sessionFilesOf } from './sessionFixtures'
import { summaryComparisonsOf } from './summaryComparison'
import { sessionTableOf } from './sessionTable'

/** A game session of `commit` on seed `worldSeed` that ends after `minutes` of ticks. */
function gameSession(runId: string, commit: string, minutes: number, worldSeed: number | null) {
  const lines = [
    runEventLine(runId, 0, { tick: 0 }, 'game_started', {
      gameVersion: '0.1.0',
      buildCommit: commit,
      platform: 'browser',
      debug: true,
    }),
    runEventLine(runId, 1, { tick: 3600 * minutes }, 'game_ended', { reason: 'quit' }),
  ]
  const metadata = worldSeed === null ? null : { buildCommit: commit, worldSeed }
  return sessionFilesOf(`sessions/${runId}`, lines, metadata)
}

function comparisonsOf(files: ReturnType<typeof gameSession>[]) {
  return summaryComparisonsOf(sessionTableOf(files).sessions)
}

describe('summary comparison across commits', () => {
  it('compares the newest session of a seed with the newest before it on another commit', () => {
    const [comparison] = comparisonsOf([
      gameSession('run_2026-10-01_10-00-00', 'aaaaaaa', 1, 7),
      gameSession('run_2026-10-02_10-00-00', 'bbbbbbb', 2, 7),
      gameSession('run_2026-10-03_10-00-00', 'bbbbbbb', 3, 7),
      gameSession('run_2026-10-03_11-00-00', 'ccccccc', 4, 7),
    ])
    expect(comparison.before).toEqual({ runId: 'run_2026-10-03_10-00-00', commit: 'bbbbbbb' })
    expect(comparison.after).toEqual({ runId: 'run_2026-10-03_11-00-00', commit: 'ccccccc' })
    if (!comparison.comparison.ok) throw new Error(comparison.comparison.problems.join())
    expect(comparison.comparison.rows.find((row) => row.metric === 'run length')).toMatchObject({
      a: '3.0 min',
      b: '4.0 min',
    })
  })

  it('compares nothing while every session of a seed ran one commit', () => {
    const files = [
      gameSession('run_2026-10-01_10-00-00', 'aaaaaaa', 1, 7),
      gameSession('run_2026-10-02_10-00-00', 'aaaaaaa', 2, 7),
    ]
    expect(comparisonsOf(files)).toEqual([])
  })

  it('never pairs sessions of two seeds, or a session whose seed is unknown', () => {
    const files = [
      gameSession('run_2026-10-01_10-00-00', 'aaaaaaa', 1, 7),
      gameSession('run_2026-10-02_10-00-00', 'bbbbbbb', 2, 8),
      gameSession('run_2026-10-03_10-00-00', 'ccccccc', 2, null),
    ]
    expect(comparisonsOf(files)).toEqual([])
  })
})
