import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../../../../systems/authority/domainEvent'
import type { Spray } from '../../../../systems/render/particles'
import { createSeededRandom } from '../../../../systems/seededRandom'
import {
  activeFxIdsOf,
  advanceFxRun,
  aimHullAt,
  aimMote,
  createFxRuns,
  FX_RUNS,
  fxStartsOf,
  motesDue,
  startItemFx,
  type FxHull,
  type FxRun,
} from './powerUpFxFeed'

const SHIELD = 'power.steam_shield'
const BOOST = 'power.steam_boost'

function used(itemId: string, toggledOn?: boolean): DomainEvent {
  return {
    type: 'power-up-core.PowerUpUsed',
    tick: 10,
    playerId: 'p1',
    itemId,
    slot: 'powerup.1',
    mark: 0,
    originTx: 4,
    originTy: -7,
    chargesLeft: 1,
    ...(toggledOn !== undefined && { toggledOn }),
  }
}

function emptySpray(): Spray {
  return { x: 0, y: 0, dirX: 0, dirY: 0, speed: 0, spreadRadians: 0, lifeSeconds: 0 }
}

/** A hull at (2, -3) whose drill points straight down. */
function hullDrillingDown(): FxHull {
  const hull = { x: 2, y: -3, aheadX: 0, aheadY: 0 }
  aimHullAt(hull, 2, -4)
  return hull
}

/** Starts one use of the item and plays it `seconds` on at `fps`. */
function runOf(itemId: string, seconds = 0, fps = 60): FxRun {
  const runs = createFxRuns()
  startItemFx(runs, { itemId, tx: 4, ty: -7 })
  const run = runs.runs[0]!
  for (let frame = 0; frame < Math.round(seconds * fps); frame++) advanceFxRun(run, 1 / fps)
  return run
}

function moteOf(run: FxRun, hull: FxHull): Spray {
  const spray = emptySpray()
  aimMote(run, hull, createSeededRandom(250), spray)
  return spray
}

describe('power-up fx feed', () => {
  it('draws every use in a batch of events, and nothing for a toggle switched off', () => {
    const events = [used(SHIELD), used(BOOST, false), used(BOOST, true)]
    expect(fxStartsOf(events)).toEqual([
      { itemId: SHIELD, tx: 4, ty: -7 },
      { itemId: BOOST, tx: 4, ty: -7 },
    ])
  })

  it('starts the steam shield curtain from the middle of the tile it was raised on', () => {
    const run = runOf(SHIELD)
    expect(run.fx?.id).toBe('shield-curtain')
    expect([run.originX, run.originY]).toEqual([4.5, -6.5])
  })

  it('replaces the oldest effect once every run is busy', () => {
    const runs = createFxRuns()
    const items = [SHIELD, BOOST, SHIELD, BOOST, SHIELD]
    items.forEach((itemId) => startItemFx(runs, { itemId, tx: 0, ty: 0 }))
    expect(runs.started).toBe(items.length)
    expect(runs.runs.map((run) => run.startedAt).sort()).toEqual([1, 2, 3, 4])
    expect(activeFxIdsOf(runs)).toHaveLength(FX_RUNS)
  })

  it('starts nothing for an item with no effect', () => {
    const runs = createFxRuns()
    startItemFx(runs, { itemId: 'power.grav_anchor', tx: 0, ty: 0 })
    expect(activeFxIdsOf(runs)).toEqual([])
  })

  it('frees the curtain after its 120-tick window, taking the same time at 30 and 144 fps', () => {
    for (const fps of [30, 144]) {
      expect(runOf(SHIELD, 1.9, fps).fx?.id).toBe('shield-curtain')
      expect(runOf(SHIELD, 2.05, fps).fx).toBeNull()
    }
  })

  it('owes motes for each strand at full strength, and none once the effect is over', () => {
    const run = runOf(SHIELD, 1)
    expect(motesDue(run, 1 / 2)).toBe(24 * 8 * (1 / 2))
    advanceFxRun(run, 2)
    expect(motesDue(run, 1)).toBe(0)
  })

  it('throws the sounder ring at its reach round where it pinged, drifting outward', () => {
    const ring = runOf('power.echo_sounder', 1)
    const mote = moteOf(ring, hullDrillingDown())
    const [dx, dy] = [mote.x - ring.originX, mote.y - ring.originY]
    expect(Math.hypot(dx, dy)).toBeCloseTo(12)
    expect(dx * mote.dirX + dy * mote.dirY).toBeGreaterThan(0)
  })

  it('flows the shifter drag inward to the hull wherever the hull has moved', () => {
    const hull = hullDrillingDown()
    const drag = runOf('power.ore_shifter', 0.5)
    const mote = moteOf(drag, hull)
    const [dx, dy] = [mote.x - hull.x, mote.y - hull.y]
    expect(drag.frame.reachM).toBeGreaterThan(3)
    expect(Math.hypot(dx, dy)).toBeCloseTo(drag.frame.reachM)
    expect(dx * mote.dirX + dy * mote.dirY).toBeLessThan(0)
  })

  it('trails the boost plume behind the hull, away from the drill', () => {
    const hull = hullDrillingDown()
    const mote = moteOf(runOf(BOOST, 0.2), hull)
    expect(mote.y).toBeGreaterThan(hull.y)
  })

  it('points the drill straight ahead when its nose sits on the hull', () => {
    const hull = { x: 1, y: 1, aheadX: 0, aheadY: 0 }
    aimHullAt(hull, 1, 1)
    expect([hull.aheadX, hull.aheadY]).toEqual([1, 0])
  })
})
