import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import type { SliceRun } from '../../systems/bot/playSlice'
import {
  cementPinDriftBpOf,
  cementPinRunsOf,
  CEMENT_PIN,
  COMBAT_HOLD_HELD,
  FOAM_PACE_EXTRA_SEEDS,
  heldSeedReportOf,
  isHeldForCombatHold,
  medianBpOf,
  playFoamGateRuns,
} from './foamPaceGate'
import { FOAM_PACE_SEEDS, type FoamPaceRuns } from './foamPaceRuns'

const COLLAPSE_DEATH: DomainEvent = {
  type: 'VehicleDestroyed',
  tick: 0,
  cause: 'collapse',
  attacker: null,
}

/** A finished run of `ticks`, destroyed once when `isDestroyed`. */
function runOf(ticks: number, isDestroyed = false): SliceRun {
  const events = isDestroyed ? [COLLAPSE_DEATH] : []
  return { events, state: { tick: ticks }, isFinished: true } as unknown as SliceRun
}

/** A stub `runsOn` whose bare rig dies on `bareDeathSeeds`, recording the seeds it plays. */
function stubRunsOn(bareDeathSeeds: readonly number[], holderTicks = 30000) {
  const played: number[] = []
  const runsOn = (seed: number): FoamPaceRuns => {
    played.push(seed)
    const bare = runOf(40000, bareDeathSeeds.includes(seed))
    return { planet: 7, seed, bare, withHolders: runOf(holderTicks) }
  }
  return { runsOn, played }
}

describe('stabiliser foam pace gate (Systems ruling on #664)', () => {
  it('plays only the pacing seeds when two of their pairs survive', () => {
    const { runsOn, played } = stubRunsOn([FOAM_PACE_SEEDS[0]])
    const runs = playFoamGateRuns(runsOn)
    expect(played).toEqual([...FOAM_PACE_SEEDS])
    expect(runs.survived.map((pair) => pair.seed)).toEqual(FOAM_PACE_SEEDS.slice(1))
  })

  it('adds the pinned extra seeds in order until two pairs survive', () => {
    const { runsOn, played } = stubRunsOn([
      ...FOAM_PACE_SEEDS.slice(0, 2),
      FOAM_PACE_EXTRA_SEEDS[0],
    ])
    const runs = playFoamGateRuns(runsOn)
    expect(played).toEqual([...FOAM_PACE_SEEDS, ...FOAM_PACE_EXTRA_SEEDS.slice(0, 2)])
    expect(runs.survived.map((pair) => pair.seed)).toEqual([
      FOAM_PACE_SEEDS[2],
      FOAM_PACE_EXTRA_SEEDS[1],
    ])
  })

  it('plays the whole list and returns fewer than two pairs when it runs out', () => {
    const { runsOn, played } = stubRunsOn([...FOAM_PACE_SEEDS, ...FOAM_PACE_EXTRA_SEEDS.slice(1)])
    const runs = playFoamGateRuns(runsOn)
    expect(played).toEqual([...FOAM_PACE_SEEDS, ...FOAM_PACE_EXTRA_SEEDS])
    expect(runs.survived.map((pair) => pair.seed)).toEqual([FOAM_PACE_EXTRA_SEEDS[0]])
  })

  it('leaves out a pair whose holder rig died, though the bare one survived', () => {
    const runsOn = (seed: number): FoamPaceRuns => ({
      planet: 7,
      seed,
      bare: runOf(30000),
      withHolders: runOf(30000, seed === FOAM_PACE_SEEDS[1]),
    })
    const seeds = playFoamGateRuns(runsOn).survived.map((pair) => pair.seed)
    expect(seeds).toEqual([FOAM_PACE_SEEDS[0], FOAM_PACE_SEEDS[2]])
  })

  it('takes the floored mean of the middle two of an even count', () => {
    expect(medianBpOf([9999, 9700])).toBe(9849)
    expect(medianBpOf([9900, 9500, 10000])).toBe(9900)
  })

  it("judges cement's pin only on the pinned seeds whose bare rig died", () => {
    const pinnedSeeds = CEMENT_PIN.holderCoreTicks.map(({ seed }) => seed)
    const { runsOn } = stubRunsOn([pinnedSeeds[1]])
    expect(cementPinRunsOf(runsOn).map((pair) => pair.seed)).toEqual([pinnedSeeds[1]])
  })

  it("measures the holder's drift from its pinned ticks in basis points", () => {
    const [{ seed, ticks }] = CEMENT_PIN.holderCoreTicks
    const runsOf = (holderTicks: number) => ({
      planet: 7,
      seed,
      bare: runOf(40000, true),
      withHolders: runOf(holderTicks),
    })
    expect(cementPinDriftBpOf(runsOf(ticks))).toBe(0)
    expect(cementPinDriftBpOf(runsOf(ticks * 2))).toBe(10000)
    expect(cementPinDriftBpOf(runsOf(ticks / 2))).toBe(5000)
  })

  it('holds only the seeds ticket 742 names, judging every other pacing and pinned seed', () => {
    const pinnedSeeds = CEMENT_PIN.holderCoreTicks.map(({ seed }) => seed)
    const held = [...FOAM_PACE_SEEDS, ...pinnedSeeds].filter(isHeldForCombatHold)
    expect(new Set(held)).toEqual(new Set(COMBAT_HOLD_HELD.seeds))
  })

  it("reports a held seed's deaths, pin drift and lining share without judging them", () => {
    const [seed] = COMBAT_HOLD_HELD.seeds
    const pinned = CEMENT_PIN.holderCoreTicks.find((entry) => entry.seed === seed)?.ticks ?? 0
    const income = [
      { type: 'ResourceSold', value: '1000' },
      { type: 'LiningSettled', billed: '64' },
    ] as unknown as DomainEvent[]
    const holders = runOf(pinned * 2, true)
    const withHolders = { ...holders, events: [...holders.events, ...income] }
    const runs = { planet: 7, seed, bare: runOf(40000, true), withHolders }
    expect(heldSeedReportOf(runs)).toMatchObject({
      row: 'foam_pace_held_seed',
      seed,
      heldBy: 742,
      isBareRigDestroyed: true,
      isHolderRigDestroyed: true,
      cementPinDriftBp: 10000,
      liningShareBp: 640,
    })
  })
})
