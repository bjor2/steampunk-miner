import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GOLDEN_SCRIPTS, stampScript } from '../systems/replay/goldenScripts'
import {
  currentGoldenVersions,
  goldenRunProblems,
  recordGoldenRun,
  REGENERATE_HINT,
  type GoldenRun,
} from './goldenRun'

const GOLDEN_FOLDER = new URL('../../tests/golden/', import.meta.url)

function committedGoldenRuns(): GoldenRun[] {
  return readdirSync(GOLDEN_FOLDER)
    .filter((name) => name.endsWith('.golden.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(new URL(name, GOLDEN_FOLDER), 'utf8')) as GoldenRun)
}

const firstGolden = () => recordGoldenRun(GOLDEN_SCRIPTS[0])

describe('golden runs (committed in tests/golden)', () => {
  it('has a committed file for every golden script and no file without one', () => {
    expect(committedGoldenRuns().map((golden) => golden.name)).toEqual(
      GOLDEN_SCRIPTS.map((script) => script.name).sort(),
    )
  })

  it.each(committedGoldenRuns().map((golden) => [golden.name, golden] as const))(
    'replays %s to every committed digest at the fixed step, 30 and 144 fps',
    (_name, golden) => {
      expect(goldenRunProblems(golden)).toEqual([])
    },
  )
})

describe('golden run gate', () => {
  it('fails with the tick when a digest changes under unchanged versions', () => {
    const golden = firstGolden()
    const tampered = {
      ...golden,
      digests: golden.digests.map((digest, index) =>
        index === 0 ? { ...digest, digest: '0000000000000000' } : digest,
      ),
    }
    const problems = goldenRunProblems(tampered)
    expect(problems).toHaveLength(3)
    expect(problems[0]).toContain(`at tick ${golden.digests[0].tick}`)
    expect(problems[0]).toContain('bump the version')
  })

  it('asks to regenerate the file when a version constant was bumped without it', () => {
    const golden = firstGolden()
    const stale = { ...golden, generatorVersion: currentGoldenVersions().generatorVersion - 1 }
    expect(goldenRunProblems(stale)).toEqual([expect.stringContaining(REGENERATE_HINT)])
  })

  it('keeps the committed command lists in step with the scripts that made them', () => {
    const committed = committedGoldenRuns()
    for (const script of GOLDEN_SCRIPTS) {
      const golden = committed.find((candidate) => candidate.name === script.name)
      expect(golden?.commands).toEqual(stampScript(script))
    }
  })
})
