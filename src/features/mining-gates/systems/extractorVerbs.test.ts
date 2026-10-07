import { describe, expect, it } from 'vitest'
import { ofType, poseOnTile } from '../../../systems/authority/charges/chargeFixtures'
import { typesOf } from '../../../systems/authority/scriptedSession'
import { cellDensitySum } from '../../../systems/world/cellYield'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { extractorStateOf } from './extractorState'
import { extractorWorkOf } from './extractorWork'
import { BREAK_TICKS, drillFor, extractorSiteOn, touch } from './extractorFixtures'
import { VERB_ROWS } from './verbRows'

// The five extractor verbs (#142 "The extraction rigs", ticket 237) on generated cells of the first
// pacing seed, each on the first planet that has its cells near the surface: tune on planet 7,
// capture on 12, mark on 19, pull on 26 and tow on 33. The drill is on curve, so only the gate and
// its verb decide.

const { tune, mark, pull } = VERB_ROWS

function gateClearedAt(events: ReturnType<typeof touch>, tile: TilePoint) {
  return ofType(events, 'mining-gates.GateCleared').filter(
    (event) => event.tx === tile.tx && event.ty === tile.ty,
  )
}

describe('extractor verbs: tune', () => {
  it('rings a touched resonance cell after the tune, then lets the drill cut it', () => {
    const { session, tile } = extractorSiteOn(7, 'rig.resonance')
    expect(typesOf(touch(session, tile, 10))).toContain('DrillGated')
    expect(drillFor(session, tile, 10 + tune.tuneTicks - 1, 20)).not.toContainEqual(
      expect.objectContaining({ type: 'TileDestroyed', ...tile }),
    )
    const rung = session.advanceTo(10 + tune.tuneTicks)
    expect(ofType(rung, 'mining-gates.OreTuned')).toEqual([
      expect.objectContaining({ ...tile, untilTick: 10 + tune.tuneTicks + tune.tunedHoldTicks }),
    ])
    const drilled = drillFor(session, tile, 10 + tune.tuneTicks + BREAK_TICKS, BREAK_TICKS)
    expect(gateClearedAt(drilled, tile)).toEqual([
      expect.objectContaining({ gateKind: 'rig', method: 'rig' }),
    ])
  })

  it('takes the same tune ticks whichever way the clock is stepped', () => {
    const settledIn = (step: number) => {
      const { session, tile } = extractorSiteOn(7, 'rig.resonance')
      touch(session, tile, 10)
      for (let tick = 10 + step; tick <= 10 + tune.tuneTicks + step; tick += step) {
        session.advanceTo(tick)
      }
      return ofType(session.events(), 'mining-gates.OreTuned').map((event) => event.tick)
    }
    expect(settledIn(1)).toEqual([10 + tune.tuneTicks])
    expect(settledIn(7)).toEqual(settledIn(1))
  })

  it('breaks the tune when the vehicle moves off, and the cell stays refused', () => {
    const { session, tile } = extractorSiteOn(7, 'rig.resonance')
    touch(session, tile, 10)
    session.submit(20, poseOnTile({ tx: tile.tx - tune.rangeTiles - 2, ty: tile.ty }))
    expect(typesOf(session.advanceTo(21))).toContain('mining-gates.TuneBroken')
    expect(typesOf(session.advanceTo(10 + tune.tuneTicks + 5))).not.toContain(
      'mining-gates.OreTuned',
    )
  })

  it('keeps the fork folded once the tune rang, having worked from the touch', () => {
    const { session, tile } = extractorSiteOn(7, 'rig.resonance')
    touch(session, tile, 10)
    session.advanceTo(40)
    expect(extractorWorkOf(session.state(), 'p1', 'rig.resonance')).toEqual({
      isWorking: true,
      ticksSinceChange: 30,
    })
    session.advanceTo(10 + tune.tuneTicks + 15)
    expect(extractorWorkOf(session.state(), 'p1', 'rig.resonance')).toEqual({
      isWorking: false,
      ticksSinceChange: 15,
    })
  })
})

describe('extractor verbs: capture', () => {
  it('bottles a containment cell the drill frees in a canister, so its ore reaches the hold', () => {
    const { session, tile } = extractorSiteOn(12, 'rig.containment')
    const drilled = drillFor(session, tile, BREAK_TICKS, BREAK_TICKS)
    expect(ofType(drilled, 'mining-gates.CanisterFilled')).toEqual([
      expect.objectContaining({ ...tile, canistersLeft: VERB_ROWS.capture.canistersPerDive - 1 }),
    ])
    expect(gateClearedAt(drilled, tile)).toEqual([expect.objectContaining({ method: 'rig' })])
    expect(typesOf(drilled)).toContain('CargoAdded')
  })

  it('vents a containment cell without the hood', () => {
    const { session, tile } = extractorSiteOn(12, 'rig.containment', [])
    const drilled = drillFor(session, tile, BREAK_TICKS, BREAK_TICKS)
    expect(ofType(drilled, 'mining-gates.GateOreLost')).toEqual([
      expect.objectContaining({ ...tile, cause: 'vented' }),
    ])
    expect(typesOf(drilled)).not.toContain('CargoAdded')
  })
})

describe('extractor verbs: mark', () => {
  it('sprays a mark on the touch and lets the drill cut the cell once it has etched', () => {
    const { session, tile } = extractorSiteOn(19, 'rig.acid_etcher')
    expect(ofType(touch(session, tile, 10), 'mining-gates.MarkSprayed')).toEqual([
      expect.objectContaining({
        ...tile,
        readyAtTick: 10 + mark.etchTicks,
        marksLeft: mark.marksPerDive - 1,
      }),
    ])
    expect(gateClearedAt(drillFor(session, tile, 10 + BREAK_TICKS, BREAK_TICKS), tile)).toEqual([])
    const etched = 10 + mark.etchTicks + BREAK_TICKS
    expect(gateClearedAt(drillFor(session, tile, etched, BREAK_TICKS), tile)).toEqual([
      expect.objectContaining({ method: 'rig' }),
    ])
  })

  it('sprays one mark for a cell however often the drill touches it', () => {
    const { session, tile } = extractorSiteOn(19, 'rig.acid_etcher')
    touch(session, tile, 10)
    touch(session, tile, 20)
    expect(extractorStateOf(session.state(), 'p1').marksUsed).toBe(1)
  })
})

describe('extractor verbs: pull', () => {
  it('pulls a touched coil cell into the hold and leaves open space, the drill never cutting it', () => {
    const { session, params, tile } = extractorSiteOn(26, 'rig.induction')
    touch(session, tile, 10)
    const pulled = session.advanceTo(10 + pull.pullTicks + 2)
    expect(gateClearedAt(pulled, tile)).toEqual([
      expect.objectContaining({ gateKind: 'rig', method: 'rig', tick: 10 + pull.pullTicks }),
    ])
    expect(ofType(pulled, 'CargoAdded')).toEqual([expect.objectContaining({ playerId: 'p1' })])
    expect(cellDensitySum(session.state().world, params, tile)).toBe(0)
  })

  it('lets go of a cell the vehicle left out of range', () => {
    const { session, params, tile } = extractorSiteOn(26, 'rig.induction')
    touch(session, tile, 10)
    session.submit(20, poseOnTile({ tx: tile.tx - pull.rangeTiles - 2, ty: tile.ty }))
    expect(typesOf(session.advanceTo(10 + pull.pullTicks + 2))).toContain('mining-gates.PullBroken')
    expect(cellDensitySum(session.state().world, params, tile)).toBeGreaterThan(0)
  })
})

describe('extractor verbs: tow', () => {
  it('harpoons the lump the drill frees and sends it with the hold', () => {
    const { session, tile } = extractorSiteOn(33, 'rig.aether_tether')
    const drilled = drillFor(session, tile, BREAK_TICKS, BREAK_TICKS)
    expect(ofType(drilled, 'mining-gates.LumpHarpooned')).toEqual([
      expect.objectContaining({ ...tile }),
    ])
    expect(typesOf(drilled)).toContain('CargoAdded')
    expect(extractorStateOf(session.state(), 'p1').tow).not.toBeNull()
  })

  it('lets a lump drift off without the tether', () => {
    const { session, tile } = extractorSiteOn(33, 'rig.aether_tether', [])
    const drilled = drillFor(session, tile, BREAK_TICKS, BREAK_TICKS)
    expect(ofType(drilled, 'mining-gates.GateOreLost')).toEqual([
      expect.objectContaining({ cause: 'drifted' }),
    ])
  })
})
