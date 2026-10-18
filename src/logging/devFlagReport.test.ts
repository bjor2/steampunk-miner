import { describe, expect, it } from 'vitest'
import { DEV_FLAGS } from '../constants/devFlags'
import { createAuthorityState } from '../systems/authority/authorityState'
import { devFlagSetLine, refuseTaintedRuns, taintedRunProblems } from './devFlagReport'
import { devFlagsOfRun, runFlagFieldsOf } from './runMetadata'

// Tainted runs (ticket 547, VS on #547): every report prints the flag set it ran with, and a paired
// or compared report refuses a run that `debug.setFlags` marked, even one flipped back.

const DEFAULT = createAuthorityState({ planetIndex: 1, planetSeed: 1, playerIds: ['p1'] })
const FLIPPED = {
  ...DEFAULT,
  devFlagDelta: { 'drill.exactCarry': false },
  devFlagsEverSet: true as const,
}
const FLIPPED_BACK = { ...DEFAULT, devFlagsEverSet: true as const }

describe('the dev flag set of a report', () => {
  it('names a default run as on the shipped defaults, every flag listed', () => {
    const line = devFlagSetLine([DEFAULT, DEFAULT])
    expect(line).toMatch(/^dev flags: shipped defaults, never set; /)
    expect(line).toContain('drill.sweptCut on')
    expect(line).toContain('drill.exactCarry on')
    expect(line).toContain('codex.materialContact on')
  })

  it('labels a run with flags set as tainted, with what it set', () => {
    const line = devFlagSetLine([FLIPPED, DEFAULT])
    expect(line).toContain('TAINTED, 1 of 2 runs set flags (drill.exactCarry off), not evidence')
    expect(line).toContain('drill.exactCarry off')
  })
})

describe('a paired or compared report', () => {
  it('accepts runs on the shipped defaults', () => {
    const runs = [
      { label: 'never', state: DEFAULT },
      { label: 'forced', state: DEFAULT },
    ]
    expect(taintedRunProblems(runs)).toEqual([])
    expect(() => refuseTaintedRuns('balance:bore', runs)).not.toThrow()
  })

  it('refuses a run with flags set, and one flipped back to the defaults', () => {
    const runs = [
      { label: 'seed 1', state: FLIPPED },
      { label: 'seed 2', state: FLIPPED_BACK },
      { label: 'seed 3', state: DEFAULT },
    ]
    expect(taintedRunProblems(runs)).toEqual([
      'seed 1 ran with dev flags set (drill.exactCarry off): not evidence',
      'seed 2 ran with dev flags set (flipped back to the defaults): not evidence',
    ])
    expect(() => refuseTaintedRuns('balance:report', runs)).toThrow(/^balance:report refused: /)
  })
})

describe("a run log header's dev flags", () => {
  it('writes no field for a session nobody flipped', () => {
    expect(runFlagFieldsOf(DEFAULT, DEV_FLAGS)).toEqual({})
  })

  it('writes the delta and the marker, and reads them back as the session had them', () => {
    const fields = runFlagFieldsOf(FLIPPED, DEV_FLAGS)
    expect(fields).toEqual({ flagsDelta: { 'drill.exactCarry': false }, devFlagsEverSet: true })
    expect(devFlagsOfRun(fields)).toEqual({
      devFlagDelta: { 'drill.exactCarry': false },
      devFlagsEverSet: true,
    })
    expect(runFlagFieldsOf(FLIPPED_BACK, DEV_FLAGS)).toEqual({ devFlagsEverSet: true })
  })

  it('names the client loop flags off their defaults beside the authority ones (ticket 548)', () => {
    const client = { ...DEV_FLAGS, 'drill.sweptCut': false }
    expect(runFlagFieldsOf(FLIPPED, client)).toEqual({
      flagsDelta: { 'drill.exactCarry': false, 'drill.sweptCut': false },
      devFlagsEverSet: true,
    })
  })

  it('reads a header naming only a client flag back as a marked run', () => {
    const flags = devFlagsOfRun({ flagsDelta: { 'drill.reportEveryTick': false } })
    expect(flags).toEqual({ devFlagsEverSet: true })
    expect(taintedRunProblems([{ label: 'the session', state: flags }])).toHaveLength(1)
  })
})
