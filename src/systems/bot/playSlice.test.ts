import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../authority/authorityState'
import { startLevels, vehicleStatsAt } from '../economy/vehicleStats'
import { takeSnapshot } from '../authority/sessionSnapshot'
import { digestsOf, replayRun } from '../replay/replayRun'
import { saveSlotOf } from '../save/saveSlot'
import { dockSiteOf } from '../world/dockSite'
import { planetParamsFor } from '../world/planetParams'
import { boreTicks } from './botWorld'
import { playSlice, type SliceRun } from './playSlice'

const WORLD_SEED = 83921
/** The slice target is at most 130 minutes (#29); the budget leaves room to see a miss. */
const BUDGET_TICKS = 3 * 60 * 60 * 60

let run: SliceRun | null = null

/** One bot run, shared: it plays about 100 minutes of the slice in a few seconds. */
function sliceRun(): SliceRun {
  run ??= playSlice(
    createAuthorityState({ planetIndex: 1, planetSeed: WORLD_SEED, playerIds: ['p1'] }),
    {
      maxTicks: BUDGET_TICKS,
    },
  )
  return run
}

describe('pacing bot', () => {
  it('plays a fresh planet 1 through to the planet 2 core inside its budget', () => {
    expect(sliceRun().isFinished).toBe(true)
    expect(sliceRun().state.planet.index).toBe(2)
  })

  it('sends only commands the authority accepts', () => {
    expect(sliceRun().events.filter((event) => event.type === 'CommandRejected')).toEqual([])
  })

  it('replays from the world seed and its own commands to the same digests and state', () => {
    const { commands, events, state } = sliceRun()
    const replayed = replayRun(WORLD_SEED, commands, { endTick: state.tick })
    expect(replayed.digests.slice(0, -1)).toEqual(digestsOf(events))
    expect(replayed.state).toEqual(state)
  })
})

describe('pacing bot save size (#36 acceptance 4)', () => {
  it('keeps the save of a 60-minute run under 1 MB', () => {
    const hour = playSlice(
      createAuthorityState({ planetIndex: 1, planetSeed: WORLD_SEED, playerIds: ['p1'] }),
      { maxTicks: 60 * 60 * 60 },
    )
    const save = JSON.stringify(saveSlotOf(takeSnapshot(hour.state), 1))
    expect(Object.keys(hour.state.world.chunks).length).toBeGreaterThan(10)
    expect(save.length).toBeLessThan(1024 * 1024)
  })
})

describe('pacing bot world model', () => {
  it('will not bore a tile the tip only skids on (P < H/4)', () => {
    const params = planetParamsFor(WORLD_SEED, 1)
    expect(boreTicks(vehicleStatsAt(startLevels()), params, { tx: 0, ty: 0 }, 'core')).toBeNull()
  })

  it('bores band-1 ground in the 40 ticks of the #7 rule at level 0', () => {
    const params = planetParamsFor(WORLD_SEED, 1)
    const site = dockSiteOf(params)
    const ground = { tx: site.lastColumn + 2, ty: site.padRow - 1 }
    expect(boreTicks(vehicleStatsAt(startLevels()), params, ground, 'ground')).toBe(40)
  })
})
