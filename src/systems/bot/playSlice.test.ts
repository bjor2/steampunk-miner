import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../authority/authorityState'
import { startLevels, vehicleStatsAt } from '../economy/vehicleStats'
import { takeSnapshot } from '../authority/sessionSnapshot'
import { digestsOf, replayRun } from '../replay/replayRun'
import { saveSlotOf } from '../save/saveSlot'
import { dockSiteOf } from '../world/dockSite'
import { planetParamsFor } from '../world/planetParams'
import type { DomainEvent } from '../authority/domainEvent'
import { requiredCasingGrade } from '../economy/casingGrades'
import { bandOfTile } from '../world/planetGeometry'
import { CORE_CELL, GROUND_CELL } from '../world/worldCell'
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

/** Each planet-1 tile the bot broke, with the casing grade it held at the time. */
function planet1DigsWithGrade(events: readonly DomainEvent[]) {
  const params = planetParamsFor(WORLD_SEED, 1)
  const travelled = events.findIndex((event) => event.type === 'TravelStarted')
  let grade = 1
  return events.slice(0, travelled).flatMap((event) => {
    if (event.type === 'CasingUpgraded') grade = event.to
    if (event.type !== 'TileDestroyed') return []
    const band = event.kind === 'core' ? 6 : bandOfTile(params, event.tx, event.ty)
    return [{ band, grade }]
  })
}

describe('pacing bot casing (S11, #65 Systems & Economy note 2)', () => {
  it('buys every casing grade from 2 to 5 on planet 1', () => {
    const grades = sliceRun()
      .events.filter((event) => event.type === 'CasingUpgraded')
      .map((event) => (event.type === 'CasingUpgraded' ? event.to : 0))
    expect(grades).toEqual([2, 3, 4, 5])
  })

  it('holds the grade a band needs before it breaks a tile there, and grade 5 before core', () => {
    const digs = planet1DigsWithGrade(sliceRun().events)
    expect(digs.some((dig) => dig.band === 6)).toBe(true)
    expect(digs.filter((dig) => dig.grade < requiredCasingGrade(dig.band))).toEqual([])
  })
})

describe('pacing bot save size (#36 acceptance 4)', () => {
  it('keeps the save of a 60-minute run under 1 MB', () => {
    // The hour's largest world is planet 1's at its core: travelling empties the world, so the
    // save is taken there (or at 60 minutes, whichever comes first), not a few minutes into
    // planet 2, where how many chunks it holds depends on when the core fell (#115).
    const hour = playSlice(
      createAuthorityState({ planetIndex: 1, planetSeed: WORLD_SEED, playerIds: ['p1'] }),
      { maxTicks: 60 * 60 * 60, lastPlanet: 1 },
    )
    const save = JSON.stringify(saveSlotOf(takeSnapshot(hour.state), 1))
    // A guard that the hour dug enough for the size to mean something, not a pacing number: the
    // bot touches about twenty chunks of planet 1 before its core.
    expect(Object.keys(hour.state.world.chunks).length).toBeGreaterThanOrEqual(10)
    expect(save.length).toBeLessThan(1024 * 1024)
  })
})

describe('pacing bot world model', () => {
  it('will not bore a tile the tip only skids on (P < H/4)', () => {
    const params = planetParamsFor(WORLD_SEED, 1)
    expect(boreTicks(vehicleStatsAt(startLevels()), params, { tx: 0, ty: 0 }, CORE_CELL)).toBeNull()
  })

  it('bores band-1 ground in the 40 ticks of the #7 rule at level 0', () => {
    const params = planetParamsFor(WORLD_SEED, 1)
    const site = dockSiteOf(params)
    const ground = { tx: site.lastColumn + 2, ty: site.padRow - 1 }
    expect(boreTicks(vehicleStatsAt(startLevels()), params, ground, GROUND_CELL)).toBe(40)
  })
})
