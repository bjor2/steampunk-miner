import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { shockTicks } from '../../economy/magneticHazard'
import type { ShotShape } from '../../registries/boreGun'
import type { TilePoint } from '../../world/tileGrid'
import { cellAt, EMPTY_WORLD } from '../../world/worldState'
import { ofType } from '../charges/chargeFixtures'
import type { DomainEvent } from '../domainEvent'
import { shockElectrifiedCells, shockTicksFor } from '../magnetic/electrifiedShock'
import { isCellGrounded } from '../magnetic/groundedLines'
import { PARAMS, createScriptedSession, type ScriptedSession } from '../scriptedSession'
import { readSnapshot, takeSnapshot } from '../sessionSnapshot'
import { stateDigest } from '../stateDigest'
import { nextShotTickOf } from './boreFire'
import {
  BORE_STATS,
  FIRE_EAST,
  gateOnTile,
  lineEastOf,
  ORE_RIG,
  PLAIN_RIG,
  standInPocket,
} from './boreFixtures'

// Ticket 378 (K-ground, the TD lock on #318): a shot whose shape sets `groundTicks` grounds the
// cells its line opened for that many ticks from the line's end, and the shock check reads it.

const FIRE_TICK = 10
/** Long enough for every line of a 4-cell shot to open and end. */
const END_TICK = FIRE_TICK + 30
const GROUND_TICKS = 120

const ONE_LINE: ShotShape = {
  lineOffsets: [],
  seamTurns: 0,
  liningGrade: null,
  extraEnergyPerCellBp: 0,
  groundTicks: null,
  strutTicks: null,
}
const GROUNDING: ShotShape = { ...ONE_LINE, groundTicks: GROUND_TICKS }

/** A gun answering `shape` on a planet whose every cell is electrified, with any extra gates. */
function groundingGun(
  shape: ShotShape,
  extra: (r: Parameters<SliceDefinition['register']>[0]) => void = () => {},
): SliceDefinition {
  return {
    id: 'probe',
    register(r) {
      r.boreGun({ id: 'probe.bore-gun', boreGunOf: () => BORE_STATS, shotShapeOf: () => shape })
      r.magneticGround({
        id: 'probe.live-ground',
        fieldAt: () => null,
        isElectrified: () => true,
      })
      extra(r)
    },
  }
}

function shootEast(rig: TilePoint = PLAIN_RIG): ScriptedSession {
  const session = createScriptedSession()
  standInPocket(session, rig, 0)
  session.submit(FIRE_TICK, FIRE_EAST)
  session.advanceTo(END_TICK)
  return session
}

function boredTilesOf(events: readonly DomainEvent[]): TilePoint[] {
  return ofType(events, 'TileDestroyed')
    .filter((event) => event.cause === 'bore')
    .map(({ tx, ty }) => ({ tx, ty }))
}

function groundedUntilOfShot(session: ScriptedSession): number {
  const [ended] = ofType(session.events(), 'BoreEnded')
  if (ended.groundedUntilTick === undefined) throw new Error('the line grounded nothing')
  return ended.groundedUntilTick
}

/** The shock ticks the player's drill would pay for the tile's generated cell now. */
function shockTicksNowAt(session: ScriptedSession, tile: TilePoint): number {
  const cell = cellAt(EMPTY_WORLD, PARAMS, tile)
  return shockTicksFor(session.state(), 'p1')(PARAMS, tile, cell)
}

function shockEventsBreaking(session: ScriptedSession, tile: TilePoint): DomainEvent[] {
  const broken = [{ tile, cell: cellAt(EMPTY_WORLD, PARAMS, tile) }]
  const effect = shockElectrifiedCells(session.state(), 'p1', PARAMS, broken)
  return effect.events.map((body) => ({ tick: session.state().tick, ...body }))
}

const LINE = lineEastOf(PLAIN_RIG)
const OFF_LINE: TilePoint = { tx: PLAIN_RIG.tx + 1, ty: PLAIN_RIG.ty - 3 }

describe('bore grounding: the grounded line (ticket 378)', () => {
  it('grounds the cells its line opened for groundTicks from the end of the line', () =>
    withRegistrations([groundingGun(GROUNDING)], () => {
      const session = shootEast()
      const [ended] = ofType(session.events(), 'BoreEnded')
      expect(boredTilesOf(session.events())).toEqual(LINE)
      expect(ended.groundedUntilTick).toBe(ended.tick + GROUND_TICKS)
      expect(LINE.every((tile) => isCellGrounded(session.state(), tile))).toBe(true)
      expect(isCellGrounded(session.state(), OFF_LINE)).toBe(false)
    }))

  it('takes no shock ticks for a grounded cell, and the full shock off the line', () =>
    withRegistrations([groundingGun(GROUNDING)], () => {
      const session = shootEast()
      expect(LINE.map((tile) => shockTicksNowAt(session, tile))).toEqual([0, 0, 0, 0])
      expect(shockTicksNowAt(session, OFF_LINE)).toBe(shockTicks())
    }))

  it('neither shocks nor logs a drill breaking a grounded cell, and shocks one off the line', () =>
    withRegistrations([groundingGun(GROUNDING)], () => {
      const session = shootEast()
      expect(shockEventsBreaking(session, LINE[0])).toEqual([])
      expect(ofType(shockEventsBreaking(session, OFF_LINE), 'ElectrifiedCellShocked')).toHaveLength(
        1,
      )
    }))

  it('expires on its tick: grounded the tick before, live again and gone from state on it', () =>
    withRegistrations([groundingGun(GROUNDING)], () => {
      const session = shootEast()
      const untilTick = groundedUntilOfShot(session)
      session.advanceTo(untilTick - 1)
      expect(shockTicksNowAt(session, LINE[0])).toBe(0)
      session.advanceTo(untilTick)
      expect(shockTicksNowAt(session, LINE[0])).toBe(shockTicks())
      expect(session.state().groundedLines).toBeUndefined()
    }))

  it('expires on the same tick when the clock is run in one stride or tick by tick', () =>
    withRegistrations([groundingGun(GROUNDING)], () => {
      const stride = shootEast()
      const untilTick = groundedUntilOfShot(stride)
      stride.advanceTo(untilTick + 5)
      const stepped = shootEast()
      for (let tick = END_TICK + 1; tick <= untilTick + 5; tick += 1) stepped.advanceTo(tick)
      expect(stateDigest(stepped.state())).toBe(stateDigest(stride.state()))
    }))

  it('grounds nothing and keeps no state with no groundTicks in the shape', () =>
    withRegistrations([groundingGun(ONE_LINE)], () => {
      const session = shootEast()
      expect(session.state().groundedLines).toBeUndefined()
      expect(ofType(session.events(), 'BoreEnded')[0]).not.toHaveProperty('groundedUntilTick')
      expect(shockTicksNowAt(session, LINE[0])).toBe(shockTicks())
    }))
})

describe('bore grounding: gates (ticket 378, HS on #318)', () => {
  /** Two ground cells, then the gated ore cell and one more past it. */
  const ORE_LINE = lineEastOf(ORE_RIG)

  it('refuses a gated cell on a grounding line, grounds only the cells before it, and still refuses it on the next shot', () => {
    const gated = ORE_LINE[2]
    const gun = groundingGun(GROUNDING, (r) =>
      r.gateCheck(gateOnTile(gated, 'refused', 'dynamite')),
    )
    withRegistrations([gun], () => {
      const session = shootEast(ORE_RIG)
      expect(boredTilesOf(session.events())).toEqual(ORE_LINE.slice(0, 2))
      expect(ORE_LINE.slice(0, 2).every((tile) => isCellGrounded(session.state(), tile))).toBe(true)
      expect(isCellGrounded(session.state(), gated)).toBe(false)
      expect(isCellGrounded(session.state(), ORE_LINE[3])).toBe(false)
      session.advanceTo(Math.max(session.state().tick, nextShotTickOf(session.state(), 'p1')))
      session.submit(session.state().tick, FIRE_EAST)
      session.advanceTo(session.state().tick + 30)
      const ends = ofType(session.events(), 'BoreEnded')
      expect(ends).toHaveLength(2)
      expect(ends[1]).toMatchObject({ stop: 'refused', ...gated })
      expect(boredTilesOf(session.events())).not.toContainEqual(gated)
      expect(boredTilesOf(session.events())).not.toContainEqual(ORE_LINE[3])
    })
  })
})

describe('bore grounding: snapshot (ticket 378)', () => {
  it('saves and restores the grounded lines, digest unchanged', () =>
    withRegistrations([groundingGun(GROUNDING)], () => {
      const session = shootEast()
      const restored = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
      if (!('state' in restored) || restored.problems.length > 0) throw new Error('refused')
      expect(restored.state.groundedLines).toEqual(session.state().groundedLines)
      expect(stateDigest(restored.state)).toBe(stateDigest(session.state()))
    }))

  it('saves and restores a grounding shot mid-bore, its groundTicks kept', () =>
    withRegistrations([groundingGun(GROUNDING)], () => {
      const session = createScriptedSession()
      standInPocket(session, PLAIN_RIG, 0)
      session.submit(FIRE_TICK, FIRE_EAST)
      session.advanceTo(FIRE_TICK + 3)
      const restored = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
      if (!('state' in restored) || restored.problems.length > 0) throw new Error('refused')
      expect(restored.state.bores?.[0].shot.groundTicks).toBe(GROUND_TICKS)
      expect(stateDigest(restored.state)).toBe(stateDigest(session.state()))
    }))

  it('refuses a snapshot whose grounded line is malformed', () =>
    withRegistrations([groundingGun(GROUNDING)], () => {
      const snapshot = takeSnapshot(shootEast().state())
      const broken = {
        ...snapshot,
        state: { ...snapshot.state, groundedLines: [{ untilTick: 1.5, cells: [] }] },
      }
      expect(readSnapshot(broken).problems).toContain(
        'snapshot.state.groundedLines[0] is malformed',
      )
    }))
})
