import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { AuthorityCommand } from '../systems/authority/authorityCommand'
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

/** A pose report pushing down and right, the twin bit's diagonal input; any other command as is. */
function withDrivePushedDownRight(command: AuthorityCommand): AuthorityCommand {
  if (command.type !== 'reportPose') return command
  return { ...command, payload: { ...command.payload, drive: { x: 1, y: -1 } } }
}

describe('golden runs (committed in tests/golden)', () => {
  it('has a committed file for every golden script and no file without one', () => {
    expect(committedGoldenRuns().map((golden) => golden.name)).toEqual(
      GOLDEN_SCRIPTS.map((script) => script.name).sort(),
    )
  })

  it.each(committedGoldenRuns().map((golden) => [golden.name, golden] as const))(
    'replays %s to every committed digest and its mined order at the fixed step, 30 and 144 fps',
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

  it('fails at every clock when the replay mines a different order under unchanged versions', () => {
    const golden = committedGoldenRuns().find((candidate) => candidate.minedOrder.length > 1)
    if (golden === undefined) throw new Error('no committed golden run mines two ores')
    const [first, ...rest] = golden.minedOrder
    const tampered = { ...golden, minedOrder: [...rest, first] }
    const problems = goldenRunProblems(tampered)
    expect(problems).toHaveLength(3)
    expect(problems[0]).toContain('mined order')
    expect(problems[0]).toContain('bump the version')
  })

  it('asks to regenerate the file when a version constant was bumped without it', () => {
    const golden = firstGolden()
    const stale = { ...golden, generatorVersion: currentGoldenVersions().generatorVersion - 1 }
    expect(goldenRunProblems(stale)).toEqual([expect.stringContaining(REGENERATE_HINT)])
  })

  it('mines ore in the committed runs, so the mined-order check replays a real sequence (#122)', () => {
    const mined = committedGoldenRuns().filter((golden) => golden.minedOrder.length > 0)
    expect(mined.length).toBeGreaterThan(0)
  })

  it.each(committedGoldenRuns().map((golden) => [golden.name, golden] as const))(
    'replays %s to its committed digests and mined order whatever drive its reports push (ticket 279)',
    (_name, golden) => {
      const pushed = { ...golden, commands: golden.commands.map(withDrivePushedDownRight) }
      expect(pushed.commands).not.toEqual(golden.commands)
      expect(goldenRunProblems(pushed)).toEqual([])
    },
  )

  it('keeps the committed command lists in step with the scripts that made them', () => {
    const committed = committedGoldenRuns()
    for (const script of GOLDEN_SCRIPTS) {
      const golden = committed.find((candidate) => candidate.name === script.name)
      expect(golden?.commands).toEqual(stampScript(script))
    }
  })
})
