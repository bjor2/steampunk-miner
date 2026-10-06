import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { formatSoakJobSummary } from './soakJobSummary.mjs'
import { summariseSoak } from './soakSummary.mjs'

/** The cycle boundaries of a real 10-minute `npm run soak:memory` (18 cycles, no page error). */
const REAL_SOAK = JSON.parse(
  readFileSync(new URL('./fixtures/soak-boundaries.json', import.meta.url), 'utf8'),
)
const REAL_RUN = { ...REAL_SOAK, samples: [], refusals: [], consoleErrorCount: 0 }

describe('memory soak job summary', () => {
  it('writes one row with the verdict, heap first, peak and last, and the counts of a run', () => {
    expect(formatSoakJobSummary(summariseSoak(REAL_RUN))).toBe(
      [
        '### Memory soak',
        '',
        '| Gate | Target | Cycles | Heap first / peak / last (MB) | Gate growth (MB) | Geometries | Textures | Colliders | Page errors |',
        '| ---- | ------ | -----: | ----------------------------- | ---------------: | ---------- | -------- | --------- | ----------: |',
        '| **PASS** | browser | 18 | 44.0 / 48.2 / 48.2 | +1.9 | 32 → 35 | 18 → 21 | 4 → 4 | 0 |',
        '',
      ].join('\n'),
    )
  })

  it('lists every reason a failed run failed under its row', () => {
    const run = { ...REAL_RUN, boundaries: REAL_RUN.boundaries.slice(0, 14) }

    const lines = formatSoakJobSummary(summariseSoak(run)).split('\n')

    expect(lines[4]).toBe(
      '| **FAIL** | browser | 14 | 44.0 / 47.7 / 47.6 | +1.5 | 32 → 35 | 18 → 21 | 4 → 4 | 0 |',
    )
    expect(lines.slice(5)).toEqual(['', '- only 10 cycles after warm-up; the gate needs 11', ''])
  })

  it('reports a soak that wrote no summary as a failure', () => {
    expect(formatSoakJobSummary(null)).toBe(
      [
        '### Memory soak',
        '',
        '**FAIL**: the soak wrote no summary.json, so it could not run to the end (see the job log).',
        '',
      ].join('\n'),
    )
  })
})
