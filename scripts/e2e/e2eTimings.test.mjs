import { describe, expect, it } from 'vitest'
import { e2eTimingsOf, formatE2eTimings } from './e2eTimings.mjs'

const RUN_START = '2026-10-07T10:00:00.000Z'
const at = (seconds) => new Date(Date.parse(RUN_START) + seconds * 1000).toISOString()
const result = (startSeconds, durationSeconds) => ({
  startTime: at(startSeconds),
  duration: durationSeconds * 1000,
})
const spec = (file, tests) => ({ title: file, file, tests })

const REPORT = {
  stats: {
    startTime: RUN_START,
    duration: 200_000,
    expected: 2,
    unexpected: 1,
    flaky: 1,
    skipped: 0,
  },
  suites: [
    {
      title: 'smoke.spec.ts',
      file: 'smoke.spec.ts',
      specs: [spec('smoke.spec.ts', [{ status: 'expected', results: [result(80, 20)] }])],
      suites: [
        {
          title: 'browser smoke',
          file: 'smoke.spec.ts',
          specs: [
            spec('smoke.spec.ts', [
              { status: 'flaky', results: [result(85, 30), result(115, 10)] },
            ]),
          ],
        },
      ],
    },
    {
      title: 'screens/portrait.spec.ts',
      file: 'screens/portrait.spec.ts',
      specs: [
        spec('screens/portrait.spec.ts', [
          { status: 'unexpected', results: [result(90, 100)] },
          { status: 'expected', results: [result(90, 5)] },
        ]),
      ],
    },
  ],
}

describe('e2e: run timings', () => {
  it('splits the run into the time before the first test and the tests wall clock', () => {
    expect(e2eTimingsOf(REPORT)).toMatchObject({
      totalMs: 200_000,
      beforeFirstTestMs: 80_000,
      testsWallMs: 110_000,
      summedTestMs: 165_000,
      failed: 1,
      flaky: 1,
    })
  })

  it('sums every result of a spec, retries and nested describes included, slowest spec first', () => {
    expect(e2eTimingsOf(REPORT).specs).toEqual([
      {
        file: 'screens/portrait.spec.ts',
        tests: 2,
        summedTestMs: 105_000,
        wallMs: 100_000,
        failed: 1,
        flaky: 0,
      },
      {
        file: 'smoke.spec.ts',
        tests: 2,
        summedTestMs: 60_000,
        wallMs: 45_000,
        failed: 0,
        flaky: 1,
      },
    ])
  })

  it('prints the phase and spec tables in seconds', () => {
    const text = formatE2eTimings(e2eTimingsOf(REPORT))
    expect(text).toContain('| **Playwright total** | **200.0 s** |')
    expect(text).toContain('| `smoke.spec.ts` | 2 | 60.0 s | 45.0 s | 0 | 1 |')
  })
})
