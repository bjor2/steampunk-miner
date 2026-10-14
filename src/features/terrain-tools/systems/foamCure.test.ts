import { describe, expect, it } from 'vitest'
import { COLLAPSE_WARN_TICKS } from '../../../constants/balance'
import { recordDomainEventsTo } from '../../../logging/domainEventLog'
import { createMemorySink } from '../../../logging/eventSink'
import { createRunLog } from '../../../logging/runLog'
import { runEventProblems } from '../../../logging/runEventSchema'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import {
  BAND_2_Y,
  buildWeakTunnel,
  poseAt,
  TUNNEL_FROM_X,
  TUNNEL_TO_X,
} from '../../../systems/authority/collapse/collapseFixtures'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  PARAMS,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { readSnapshot, takeSnapshot } from '../../../systems/authority/sessionSnapshot'
import { stateDigest } from '../../../systems/authority/stateDigest'
import { isCellReinforced } from '../../../systems/registries/groundReinforcement'
import { toCanonical, ZERO_MONEY } from '../../../systems/money'
import { FACING, tileOfPose } from '../../../systems/vehicle/vehiclePose'
import { cellDensitySum } from '../../../systems/world/cellYield'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { researchedMarkOf } from '../../tech-tree'
import { ofType, press } from '../terrainTestSession'
import { CURED_FOAM_SECTION, curedFoamOf } from './curedFoam'
import { CURED_FOAM_GROUND_REACTION, curedCellsPrice } from './foamCure'
import { foamCureMark, foamedCellsOf, sprayFoam, STABILISER_FOAM_ID } from './stabiliserFoam'

// Stabiliser foam's permanent cure (ticket 368, piece iv of the #157 seam): at the Mark that
// masters foam, a spray's set cells cure for good through the `groundReinforcement` registry, so
// they never refill and a block whose open cells are all cured never warns again; below that Mark
// foam only holds for its 600 ticks. Each new cured cell is billed one cell of standard first
// lining at its own band. The scene is the collapse specs' weak band-2 tunnel: its blocks warn on
// tick 10, and foam sprayed on tick 20 lapses on tick 620.

const FOAM_SLOT = { 'powerup.1': STABILISER_FOAM_ID }
const WARN_TICK = 10
const SPRAY_TICK = 20
const LAPSE_TICK = SPRAY_TICK + 600
const AFTER_REFILL_TICK = LAPSE_TICK + COLLAPSE_WARN_TICKS + 10
const TUNNEL_MIDDLE_X = (TUNNEL_FROM_X + TUNNEL_TO_X) / 2
/** Far enough down the tree that every foam Mark is researched (a Mark every 3 planets). */
const EVERY_MARK_PLANET = 60

/** The weak tunnel with foam slotted, foam's Marks researched through `cured`, then sprayed. */
function sprayedTunnel(isCureMark: boolean, slots: Record<string, string> = FOAM_SLOT) {
  const session = createScriptedSession()
  session.submit(0, setVehicleLoadoutCommand(slots))
  if (isCureMark) researchEveryMark(session)
  buildWeakTunnel(session, WARN_TICK)
  session.submit(SPRAY_TICK, press())
  return session
}

function researchEveryMark(session: ScriptedSession): void {
  session.submit(0, {
    type: 'debug.tech-tree.unlockThrough',
    payload: { planetIndex: EVERY_MARK_PLANET },
  } as CommandIntent)
}

const setTilesOf = (session: ScriptedSession): TilePoint[] =>
  foamedCellsOf(session.state(), 'p1').map(({ tx, ty }) => ({ tx, ty }))

const reinforcedOf = (session: ScriptedSession, tiles: readonly TilePoint[]) =>
  tiles.filter(({ tx, ty }) => isCellReinforced(session.state(), tx, ty))

const densityOf = (session: ScriptedSession, tiles: readonly TilePoint[]) =>
  tiles.map((tile) => cellDensitySum(session.state().world, PARAMS, tile))

const blocksOf = (events: readonly DomainEvent[], type: string) =>
  ofType(events, type).map((event) => ('block' in event ? event.block : ''))

const warnedAfter = (session: ScriptedSession, tick: number) =>
  blocksOf(
    session.events().filter((event) => event.tick > tick),
    'CollapseWarned',
  )

/**
 * Sprayed east from the tunnel's middle, then west from 6 tiles on: the two cones meet over the
 * 4x4-tile collapse block between, so every open cell of it is foamed.
 */
function sprayedFromBothEnds(isCureMark: boolean): ScriptedSession {
  const session = sprayedTunnel(isCureMark)
  session.submit(SPRAY_TICK + 1, poseAt(TUNNEL_MIDDLE_X + 6000, BAND_2_Y, 0, FACING.left))
  session.submit(SPRAY_TICK + 2, press())
  return session
}

function curedLines(events: readonly DomainEvent[]) {
  const sink = createMemorySink()
  const runLog = createRunLog({ runId: 'run_368', sink, secondsSinceStart: () => 0 })
  recordDomainEventsTo(runLog, { playerId: 'p1', planet: 1, depthTiles: 0 }, events)
  return sink.events.filter((line) => (line.event as string) === 'terrain-tools.foam_cured')
}

describe('stabiliser foam cure: the Mark', () => {
  it('is the Mark that masters foam, reached by researching down the tree', () => {
    const session = sprayedTunnel(true)
    expect(foamCureMark()).toBeGreaterThan(1)
    expect(researchedMarkOf(session.state(), 'p1', STABILISER_FOAM_ID)).toBe(foamCureMark())
  })

  it('cures nothing below the Mark: foam only holds, timed', () => {
    const session = sprayedTunnel(false)
    expect(setTilesOf(session).length).toBeGreaterThan(0)
    expect(reinforcedOf(session, setTilesOf(session))).toEqual([])
    expect(curedFoamOf(session.state())).toEqual({})
    expect(ofType(session.events(), 'terrain-tools.FoamCured')).toEqual([])
  })

  it('cures every set cell at the Mark, as world state any player reads', () => {
    const session = sprayedTunnel(true)
    const set = setTilesOf(session)
    expect(set.length).toBeGreaterThan(0)
    expect(reinforcedOf(session, set)).toEqual(set)
    expect(Object.values(curedFoamOf(session.state()))).toEqual(
      expect.arrayContaining(set.map((tile) => expect.objectContaining(tile))),
    )
  })
})

describe('stabiliser foam cure: collapse', () => {
  it('never refills a cured cell, where timed foam lets it refill after the lapse', () => {
    const plain = sprayedTunnel(false)
    const cured = sprayedTunnel(true)
    const plainTiles = setTilesOf(plain)
    const curedTiles = setTilesOf(cured)
    const plainBefore = densityOf(plain, plainTiles)
    const curedBefore = densityOf(cured, curedTiles)
    plain.advanceTo(AFTER_REFILL_TICK)
    cured.advanceTo(AFTER_REFILL_TICK)
    expect(densityOf(plain, plainTiles)).not.toEqual(plainBefore)
    expect(densityOf(cured, curedTiles)).toEqual(curedBefore)
  })

  it('never warns again a block whose open cells are all cured, where timed foam warns it afresh', () => {
    const quietOf = (isCureMark: boolean) => {
      const session = sprayedFromBothEnds(isCureMark)
      session.advanceTo(AFTER_REFILL_TICK + 10)
      const warnedAgain = new Set(warnedAfter(session, WARN_TICK))
      const started = new Set(blocksOf(session.events(), 'CollapseStarted'))
      const braced = blocksOf(session.events(), 'CollapseBraced')
      return braced.filter((block) => !warnedAgain.has(block) && !started.has(block))
    }
    expect(quietOf(false)).toEqual([])
    expect(quietOf(true).length).toBeGreaterThan(0)
  })

  it('changes no cell, so cured cells keep their hardness and band price byte for byte', () => {
    const session = createScriptedSession()
    session.submit(0, setVehicleLoadoutCommand(FOAM_SLOT))
    researchEveryMark(session)
    buildWeakTunnel(session, WARN_TICK)
    session.advanceTo(SPRAY_TICK)
    const before = JSON.stringify(session.state().world)
    session.submit(SPRAY_TICK, press())
    expect(Object.keys(curedFoamOf(session.state())).length).toBeGreaterThan(0)
    expect(JSON.stringify(session.state().world)).toBe(before)
  })
})

describe('stabiliser foam cure: price and log', () => {
  it('bills each cured cell one cell of first lining at its own band, and logs foam_cured', () => {
    const session = sprayedTunnel(true)
    const set = setTilesOf(session)
    const price = toCanonical(curedCellsPrice(PARAMS, set))
    expect(price).not.toBe(toCanonical(ZERO_MONEY))
    expect(toCanonical(session.vehicle().liningBill)).toBe(price)
    expect(ofType(session.events(), 'terrain-tools.FoamCured')).toMatchObject([
      { playerId: 'p1', cellsCured: set.length, price },
    ])
    const lines = curedLines(session.events())
    expect(lines.map((line) => line.data)).toEqual([{ cellsCured: set.length, price }])
    expect(lines.flatMap(runEventProblems)).toEqual([])
  })

  it('bills nothing for a cell already cured when sprayed again', () => {
    const session = sprayedTunnel(true)
    const bill = toCanonical(session.vehicle().liningBill)
    session.submit(SPRAY_TICK + 100, press())
    expect(ofType(session.events(), 'terrain-tools.FoamCured')).toHaveLength(1)
    expect(toCanonical(session.vehicle().liningBill)).toBe(bill)
  })
})

describe('stabiliser foam cure: ownership on apply', () => {
  it("can't be applied by a player who doesn't own foam: nothing cured or billed", () => {
    const session = sprayedTunnel(true, {})
    const state = session.state()
    const outcome = sprayFoam(state, {
      playerId: 'p1',
      itemId: STABILISER_FOAM_ID,
      slot: 'powerup.1',
      tick: SPRAY_TICK,
      origin: tileOfPose(state.players.p1.vehicle.pose!),
      mark: foamCureMark(),
      magnitude: null,
    })
    expect(outcome).toEqual({ kind: 'refused', reason: 'terrain-tools.not_owned' })
    expect(curedFoamOf(state)).toEqual({})
    expect(toCanonical(session.vehicle().liningBill)).toBe(toCanonical(ZERO_MONEY))
  })

  it('keeps holding its cells for every player once foam is given up', () => {
    const session = sprayedTunnel(true)
    const set = setTilesOf(session)
    session.submit(SPRAY_TICK + 1, setVehicleLoadoutCommand({}))
    expect(reinforcedOf(session, set)).toEqual(set)
  })
})

describe('stabiliser foam cure: when a cured cell goes', () => {
  it('drops a cured cell the step cut again, and keeps the rest', () => {
    const session = sprayedTunnel(true)
    const [cut, ...kept] = setTilesOf(session)
    const destroyed: DomainEvent = {
      type: 'TileDestroyed',
      tick: SPRAY_TICK + 1,
      playerId: 'p1',
      kind: 'ground',
      ...cut,
    }
    const state = session.state()
    const after = CURED_FOAM_GROUND_REACTION.react(state, state, [destroyed]).state
    expect(Object.keys(curedFoamOf(after)).sort()).toEqual(
      kept.map(({ tx, ty }) => `${tx},${ty}`).sort(),
    )
  })

  it('drops every cured cell on another planet', () => {
    const session = sprayedTunnel(true)
    session.submit(SPRAY_TICK + 1, { type: 'debug.setPlanet', payload: { planetIndex: 2 } })
    expect(curedFoamOf(session.state())).toEqual({})
  })
})

describe('stabiliser foam cure: save', () => {
  it('keeps the cured cells across a save, and digests the same', () => {
    const session = sprayedTunnel(true)
    session.advanceTo(LAPSE_TICK + 10)
    const loaded = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
    if (!('state' in loaded)) throw new Error(loaded.problems.join('; '))
    expect(curedFoamOf(loaded.state)).toEqual(curedFoamOf(session.state()))
    expect(stateDigest(loaded.state)).toBe(stateDigest(session.state()))
  })

  it('refuses a malformed cured cell', () => {
    expect(CURED_FOAM_SECTION.problems({ '1,2': { tx: 1, ty: 2 } })).toEqual([])
    expect(CURED_FOAM_SECTION.problems({ '1,2': { tx: 1, ty: 3 } })).toEqual([
      'terrain-tools.cured-foam.1,2 holds the cell 1,3',
    ])
    expect(CURED_FOAM_SECTION.problems(3)).toEqual(['terrain-tools.cured-foam must be an object'])
  })
})
