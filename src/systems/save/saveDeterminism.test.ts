import { describe, expect, it } from 'vitest'
import { DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { vehicleOf, type AuthorityState } from '../authority/authorityState'
import { perCellShareAt } from '../authority/cutShare'
import { walkWithinShare } from '../authority/drillStepCut'
import { planetParamsOf } from '../authority/planetOfState'
import { takeSnapshot } from '../authority/sessionSnapshot'
import { drillSweepBy } from '../authority/sweptDrill'
import { toCanonical } from '../money'
import { NO_DRIVE } from '../vehicle/driveSigns'
import { noseTileOf, tileOfMillimetres, type VehiclePose } from '../vehicle/vehiclePose'
import { cellDensitySum } from '../world/cellYield'
import type { TilePoint } from '../world/tileGrid'
import { EMPTY_WORLD } from '../world/worldState'
import {
  arrivedForDive,
  cellSubStepsOf,
  DIVE_START_TICK,
  DIVE_WALLET,
  diveTicks,
  divePathOf,
  isFractionalTicks,
  playDive,
  type DivePath,
} from './p200DiveFixture'
import { readSaveSlot, saveSlotOf } from './saveSlot'

// The Vertical Scaler's decision 1 on spec #401 (ticket 405): a planet-200 session with money near
// 1e149, saved mid-cut and mid-span, plays the next 600 ticks byte-identical to the run that was
// never saved: the same events, the same digest every tick, the same snapshot text at the end.

/** A few cells into the dive, on a tick whose cursor holds part of a tick of dig time. */
const SAVE_TICK = 151
const FOLLOW_TICKS = 600

/** As the shell writes it and reads it back: JSON text. */
function savedTextOf(state: AuthorityState): string {
  return JSON.stringify(saveSlotOf(takeSnapshot(state), 1))
}

function loadedFrom(text: string): AuthorityState {
  const reading = readSaveSlot(JSON.parse(text))
  if (!('state' in reading)) throw new Error(reading.problems.join('; '))
  return reading.state
}

/** Whether the step the dive takes on `tick` touches more cells than `p1`'s per-cell share. */
function isCutBySpan(state: AuthorityState, path: DivePath, tick: number): boolean {
  const [{ intents }] = diveTicks(path, tick, tick)
  const step = intents.find((intent) => intent.type === 'drillStep')
  if (step?.type !== 'drillStep') throw new Error(`no drill step on tick ${tick}`)
  const pose: VehiclePose = { ...(vehicleOf(state, 'p1').pose as VehiclePose), ...step.payload }
  const ticked = { ...state, tick }
  const params = planetParamsOf(state.planet)
  if (params === null) throw new Error('the dive needs a generated planet')
  const sweep = { target: noseTileOf(pose), step: { pose, drive: NO_DRIVE, isLifting: false } }
  const cells = drillSweepBy(ticked, params, 'p1', sweep, walkWithinShare).carved?.cells ?? 0
  return cells > perCellShareAt(ticked, 'p1')
}

/** A cell under the cursor worn down but still standing. */
function partlyCutCellsUnder(state: AuthorityState): TilePoint[] {
  const params = planetParamsOf(state.planet)
  const cursor = vehicleOf(state, 'p1').sweptCut
  if (params === null || cursor === undefined) return []
  const centre = tileOfMillimetres(cursor.xMm, cursor.yMm)
  const tiles = [-1, 0, 1].flatMap((dx) =>
    [-2, -1, 0, 1].map((dy) => ({ tx: centre.tx + dx, ty: centre.ty + dy })),
  )
  return tiles.filter((tile) => {
    const left = cellDensitySum(state.world, params, tile)
    return left > 0 && left < cellDensitySum(EMPTY_WORLD, params, tile)
  })
}

describe('save slot: determinism after a load on planet 200 (ticket 405)', () => {
  const arrived = arrivedForDive()
  const path = divePathOf(arrived)
  const beforeSave = playDive(arrived, diveTicks(path, DIVE_START_TICK, SAVE_TICK - 1))
  const atSave = playDive(beforeSave.state, diveTicks(path, SAVE_TICK, SAVE_TICK))
  const saved = atSave.state
  const text = savedTextOf(saved)
  const following = diveTicks(path, SAVE_TICK + 1, SAVE_TICK + FOLLOW_TICKS)
  const unsaved = playDive(saved, following)
  const loaded = playDive(loadedFrom(text), following)

  it('saves on planet 200 with the wallet near 1e149 to all 40 digits', () => {
    expect(saved.planet.index).toBe(200)
    expect(toCanonical(saved.players.p1.wallet)).toBe(DIVE_WALLET)
  })

  it('saves mid-cut: a fraction of a tick on the cursor and ground under the stamp part cut', () => {
    const cursor = vehicleOf(saved, 'p1').sweptCut
    expect(isFractionalTicks(cellSubStepsOf(saved))).toBe(true)
    expect(cursor?.tick).toBe(SAVE_TICK)
    expect((cursor?.digSubSteps ?? 0) % DRILL_SUBSTEPS_PER_TICK).not.toBe(0)
    expect(partlyCutCellsUnder(saved).length).toBeGreaterThan(0)
  })

  it('saves mid-span: the steps either side of the save are cut by the swept span', () => {
    expect(isCutBySpan(beforeSave.state, path, SAVE_TICK)).toBe(true)
    expect(isCutBySpan(saved, path, SAVE_TICK + 1)).toBe(true)
  })

  it('cuts on through the 600 ticks after the save', () => {
    const broken = unsaved.events.flat().filter((event) => event.type === 'TileDestroyed')
    expect(broken.length).toBeGreaterThan(10)
    expect(unsaved.events.flat().filter((event) => event.type === 'CommandRejected')).toEqual([])
  })

  it('answers each of the 600 ticks after a load with the same events as the unsaved run', () => {
    expect(JSON.stringify(loaded.events)).toBe(JSON.stringify(unsaved.events))
  })

  it('holds the same digest every tick and the same snapshot text at the end', () => {
    expect(loaded.digests).toEqual(unsaved.digests)
    expect(JSON.stringify(takeSnapshot(loaded.state))).toBe(
      JSON.stringify(takeSnapshot(unsaved.state)),
    )
  })

  it('writes the same bytes again when the loaded session is saved straight away', () => {
    expect(savedTextOf(loadedFrom(text))).toBe(text)
  })
})
