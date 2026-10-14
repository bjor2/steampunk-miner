import { describe, expect, it } from 'vitest'
import { COLLAPSE_FILL_TICKS, COLLAPSE_WARN_TICKS } from '../../../constants/balance'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import type { ShotShape } from '../../registries/boreGun'
import { isCellReinforced } from '../../registries/groundReinforcement'
import { cellDensitySum } from '../../world/cellYield'
import type { TilePoint } from '../../world/tileGrid'
import { ofType } from '../charges/chargeFixtures'
import type { DomainEvent } from '../domainEvent'
import { PARAMS, createScriptedSession, type ScriptedSession } from '../scriptedSession'
import { readSnapshot, takeSnapshot } from '../sessionSnapshot'
import { stateDigest } from '../stateDigest'
import { BORE_STATS, FIRE_EAST, PLAIN_RIG, standInPocket } from './boreFixtures'
import { strutReinforces } from './boreStrut'
import { strutsOf } from './strutState'

type Registrar = Parameters<SliceDefinition['register']>[0]

const FIRE_TICK = 10
/** The line's two ground cells open at fire +2 and +4; it meets the hollow at fire +6. */
const STRUT_TICK = FIRE_TICK + 6
const STRUT_TICKS = 600
const END_TICK = FIRE_TICK + 30

const NO_SHAPE: ShotShape = {
  lineOffsets: [],
  seamTurns: 0,
  liningGrade: null,
  extraEnergyPerCellBp: 0,
  groundTicks: null,
  strutTicks: null,
}
const STRUT_SHAPE: ShotShape = { ...NO_SHAPE, strutTicks: STRUT_TICKS }

/** The rig's line east: two ground cells, then the hollow's two cells. */
const [FIRST_CELL, MOUTH, POCKET, FAR_POCKET] = [1, 2, 3, 4].map((step): TilePoint => ({
  tx: PLAIN_RIG.tx + step,
  ty: PLAIN_RIG.ty,
}))

/** The registration a slice makes for struts: the kernel's answer, under its own id. */
function registerStrut(r: Registrar): void {
  r.reinforcement({ id: 'probe.strut', reinforces: strutReinforces })
}

/** A fake slice whose gun bores `shape` on every shot, with the strut registered unless told. */
function gunShaped(shape: ShotShape, register: (r: Registrar) => void = registerStrut) {
  return {
    id: 'probe',
    register(r: Registrar) {
      r.boreGun({ id: 'probe.bore-gun', boreGunOf: () => BORE_STATS, shotShapeOf: () => shape })
      register(r)
    },
  } satisfies SliceDefinition
}

/**
 * A hollow over the third and fourth cells east of the rig, the first two left standing: two
 * passes round each cell's centre clear its corners through the carve's falloff, and never reach
 * the far side of the mouth cell.
 */
function carveHollowEast(session: ScriptedSession, tick: number): void {
  for (const cell of [POCKET, FAR_POCKET, POCKET, FAR_POCKET]) carveRound(session, tick, cell, 1300)
}

function carveRound(session: ScriptedSession, tick: number, cell: TilePoint, radius: number) {
  const centre = { x: cell.tx * 1000 + 500, y: cell.ty * 1000 + 500 }
  session.submit(tick, { type: 'debug.carveCircle', payload: { ...centre, radius, amount: 255 } })
}

/** The rig in its pocket with a hollow east of it, fired due east, the clock run to `toTick`. */
function shootIntoHollow(
  toTick = END_TICK,
  prepare: (session: ScriptedSession) => void = () => {},
) {
  const session = createScriptedSession()
  standInPocket(session, PLAIN_RIG, 0)
  carveHollowEast(session, 0)
  prepare(session)
  session.submit(FIRE_TICK, FIRE_EAST)
  session.advanceTo(toTick)
  return session
}

function boredTilesOf(events: readonly DomainEvent[]): TilePoint[] {
  return ofType(events, 'TileDestroyed')
    .filter((event) => event.cause === 'bore')
    .map(({ tx, ty }) => ({ tx, ty }))
}

function densityOf(session: ScriptedSession, tile: TilePoint): number {
  return cellDensitySum(session.state().world, PARAMS, tile)
}

describe('bore strut: a line stops at a hollow and wedges a strut (ticket 379)', () => {
  it('stops the line at the first open cell past its bored ground and wedges a strut in the mouth', () =>
    withRegistrations([gunShaped(STRUT_SHAPE)], () => {
      const session = shootIntoHollow()
      expect(ofType(session.events(), 'BoreEnded')).toMatchObject([
        { tick: STRUT_TICK, stop: 'strut', ...POCKET, cellsOpened: 2 },
      ])
      expect(ofType(session.events(), 'StrutPlaced')).toMatchObject([
        { tick: STRUT_TICK, playerId: 'p1', ...MOUTH, untilTick: STRUT_TICK + STRUT_TICKS },
      ])
      expect(Object.values(strutsOf(session.state()))).toEqual([
        {
          playerId: 'p1',
          ...MOUTH,
          pocketTx: POCKET.tx,
          pocketTy: POCKET.ty,
          placedTick: STRUT_TICK,
          untilTick: STRUT_TICK + STRUT_TICKS,
        },
      ])
    }))

  it('opens no cell and yields nothing beyond what the same shot without a strut bores', () => {
    const plain = withRegistrations([gunShaped(NO_SHAPE)], () => shootIntoHollow())
    const strut = withRegistrations([gunShaped(STRUT_SHAPE)], () => shootIntoHollow())
    expect(ofType(strut.events(), 'BoreEnded')).toMatchObject([{ stop: 'strut', cellsOpened: 2 }])
    expect(ofType(plain.events(), 'BoreEnded')).toMatchObject([{ stop: 'range', cellsOpened: 2 }])
    expect(boredTilesOf(strut.events())).toEqual(boredTilesOf(plain.events()))
    expect(ofType(strut.events(), 'GroundChanged')).toEqual(ofType(plain.events(), 'GroundChanged'))
    expect(stateDigest(strut.state().world)).toBe(stateDigest(plain.state().world))
    expect(strut.vehicle().cargo).toEqual(plain.vehicle().cargo)
  })

  it('wedges no strut where the line meets no hollow, and leaves no struts key', () =>
    withRegistrations([gunShaped(STRUT_SHAPE)], () => {
      const session = createScriptedSession()
      standInPocket(session, PLAIN_RIG, 0)
      session.submit(FIRE_TICK, FIRE_EAST)
      session.advanceTo(END_TICK)
      expect(ofType(session.events(), 'StrutPlaced')).toEqual([])
      expect(ofType(session.events(), 'BoreEnded')).toMatchObject([{ stop: 'range' }])
      expect('struts' in session.state()).toBe(false)
    }))

  it('passes open cells before its first bored cell: air the rig stands in is no hollow', () =>
    withRegistrations([gunShaped(STRUT_SHAPE)], () => {
      const session = shootIntoHollow(END_TICK, (prepared) => {
        carveRound(prepared, 0, FIRST_CELL, 900)
        carveRound(prepared, 0, FIRST_CELL, 900)
      })
      expect(ofType(session.events(), 'BoreEnded')).toMatchObject([
        { stop: 'strut', ...POCKET, cellsOpened: 1 },
      ])
      expect(ofType(session.events(), 'StrutPlaced')).toMatchObject([{ ...MOUTH }])
    }))

  it('takes the strut away at its untilTick, and not before', () =>
    withRegistrations([gunShaped(STRUT_SHAPE)], () => {
      const session = shootIntoHollow(STRUT_TICK + STRUT_TICKS - 1)
      expect(Object.keys(strutsOf(session.state()))).toEqual([`${MOUTH.tx},${MOUTH.ty}`])
      session.advanceTo(STRUT_TICK + STRUT_TICKS)
      expect('struts' in session.state()).toBe(false)
    }))

  it('leaves the struts behind on another planet', () =>
    withRegistrations([gunShaped(STRUT_SHAPE)], () => {
      const session = shootIntoHollow()
      session.submit(END_TICK, { type: 'debug.setPlanet', payload: { planetIndex: 2 } })
      expect('struts' in session.state()).toBe(false)
    }))

  it('throws for a strut shape while no reinforcement provider answers for struts', () =>
    withRegistrations([gunShaped(STRUT_SHAPE, () => {})], () => {
      expect(() => shootIntoHollow()).toThrow(/strutReinforces/)
    }))
})

describe('bore strut: collapse reads it through the reinforcement registry (ticket 379)', () => {
  it('reinforces the mouth cell while the strut stands, and no other cell', () =>
    withRegistrations([gunShaped(STRUT_SHAPE)], () => {
      const state = shootIntoHollow().state()
      expect(isCellReinforced(state, MOUTH.tx, MOUTH.ty)).toBe(true)
      expect(
        [FIRST_CELL, POCKET, FAR_POCKET].map(({ tx, ty }) => isCellReinforced(state, tx, ty)),
      ).toEqual([false, false, false])
    }))

  it('keeps the mouth open through the bore collapse while the rest of the line refills', () =>
    withRegistrations([gunShaped(STRUT_SHAPE)], () => {
      const refilled = STRUT_TICK + 30 + COLLAPSE_WARN_TICKS + COLLAPSE_FILL_TICKS
      const session = shootIntoHollow(refilled)
      expect(ofType(session.events(), 'CollapseStarted').length).toBeGreaterThan(0)
      expect(densityOf(session, FIRST_CELL)).toBeGreaterThan(0)
      expect(densityOf(session, MOUTH)).toBe(0)
    }))

  it('refills the mouth like any bored cell once the strut has fallen', () =>
    withRegistrations([gunShaped({ ...STRUT_SHAPE, strutTicks: 1 })], () => {
      const refilled = STRUT_TICK + 30 + COLLAPSE_WARN_TICKS + COLLAPSE_FILL_TICKS
      const session = shootIntoHollow(refilled)
      expect(densityOf(session, MOUTH)).toBeGreaterThan(0)
    }))
})

describe('bore strut: the snapshot (ticket 379)', () => {
  it('round-trips a standing strut with its digest', () =>
    withRegistrations([gunShaped(STRUT_SHAPE)], () => {
      const state = shootIntoHollow().state()
      const restored = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(state))))
      expect(restored.problems).toEqual([])
      if (!('state' in restored)) throw new Error('refused')
      expect(strutsOf(restored.state)).toEqual(strutsOf(state))
      expect(stateDigest(restored.state)).toBe(stateDigest(state))
    }))

  it('refuses a strut filed under another cell than its own', () =>
    withRegistrations([gunShaped(STRUT_SHAPE)], () => {
      const snapshot = JSON.parse(JSON.stringify(takeSnapshot(shootIntoHollow().state())))
      const [strut] = Object.values(snapshot.state.struts as Record<string, unknown>)
      snapshot.state.struts = { '0,0': strut }
      expect(readSnapshot(snapshot).problems).toEqual(['snapshot.state.struts["0,0"] is malformed'])
    }))
})
