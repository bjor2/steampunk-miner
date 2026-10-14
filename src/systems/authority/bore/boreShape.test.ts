import { describe, expect, it, vi } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { div, fromSafeInteger, mul } from '../../money'
import { WHOLE_BP, type BoreGunStats, type ShotShape } from '../../registries/boreGun'
import { liningTypeIndexOf } from '../../vehicle/liningType'
import { cellSampleIndices } from '../../world/cellYield'
import { isCellLined } from '../../world/casingLining'
import { isLined, liningTypeIndexOfValue } from '../../world/chunkDelta'
import { chunkOfTile, type TilePoint } from '../../world/tileGrid'
import { cellAt, currentCasingOfChunk, EMPTY_WORLD } from '../../world/worldState'
import { ofType } from '../charges/chargeFixtures'
import type { DomainEvent } from '../domainEvent'
import { ticksPerCell } from '../groundDrill'
import { heatThrottledDrill } from '../heatRules'
import { PARAMS, createScriptedSession, type ScriptedSession } from '../scriptedSession'
import { readSnapshot, takeSnapshot } from '../sessionSnapshot'
import { stateDigest } from '../stateDigest'
import { AUTO_OFF, AUTO_ON, AUTO_RIG, SEAR_STATS } from './boreAutoFixtures'
import { boreCellEnergy } from './boreCell'
import { nextShotTickOf, STEAM_SEAR_ITEM_ID } from './boreFire'
import {
  BORE_STATS,
  FIRE_EAST,
  gateOnTile,
  ORE_RIG,
  PLAIN_RIG,
  standInPocket,
} from './boreFixtures'

type Registrar = Parameters<SliceDefinition['register']>[0]

const FIRE_TICK = 10
/** Long enough for every line of a 4- or 8-cell shot to open and end. */
const END_TICK = FIRE_TICK + 30
const BP = fromSafeInteger(WHOLE_BP)

const ONE_LINE: ShotShape = {
  lineOffsets: [],
  seamTurns: 0,
  liningGrade: null,
  extraEnergyPerCellBp: 0,
  groundTicks: null,
  strutTicks: null,
}

/** Two lines: due east, and 40 bearing steps below it, which leaves the row after one cell. */
const SPLAY: ShotShape = { ...ONE_LINE, lineOffsets: [-40] }
const SEAM_TURN: ShotShape = { ...ONE_LINE, seamTurns: 1 }
const LINING: ShotShape = { ...ONE_LINE, liningGrade: 'refractory_lining' }

/** A fake slice whose gun answers `stats` and, when given, `shotShapeOf`. */
function shapedGun(
  stats: BoreGunStats,
  shotShapeOf?: () => ShotShape | null,
  extra: (r: Registrar) => void = () => {},
): SliceDefinition {
  return {
    id: 'probe',
    register(r) {
      r.boreGun({ id: 'probe.bore-gun', boreGunOf: () => stats, shotShapeOf })
      extra(r)
    },
  }
}

/** The gun with `shape` on every shot. */
function gunShaped(shape: ShotShape | null, stats: BoreGunStats = BORE_STATS): SliceDefinition {
  return shapedGun(stats, () => shape)
}

function tileAt(rig: TilePoint, dx: number, dy: number): TilePoint {
  return { tx: rig.tx + dx, ty: rig.ty + dy }
}

/** Fires due east from `rig` at the fire tick and runs the clock until every line has ended. */
function shootEastFrom(rig: TilePoint): ScriptedSession {
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

/** The gun's own dig ticks for a cell of the generated planet, at the rig's level. */
function gunTicksOfCell(session: ScriptedSession, tile: TilePoint): number {
  const drillStats = heatThrottledDrill(1, session.vehicle())
  const gunPower = div(mul(drillStats.drillPower, fromSafeInteger(BORE_STATS.gunFactorBp)), BP)
  const gunDrill = { ...drillStats, drillPower: gunPower }
  return ticksPerCell(gunDrill, PARAMS, tile, cellAt(EMPTY_WORLD, PARAMS, tile)) as number
}

/** What the shot's lines have spent, which every line holds alike. */
function spentOfShot(session: ScriptedSession): number {
  const bores = session.state().bores ?? []
  const left = new Set(bores.map((bore) => bore.budgetLeft))
  expect(left.size).toBe(1)
  return bores[0].shot.boreBudgetTicks - bores[0].budgetLeft
}

function summedGunTicksOf(session: ScriptedSession): number {
  return boredTilesOf(session.events())
    .map((tile) => gunTicksOfCell(session, tile))
    .reduce((sum, ticks) => sum + ticks, 0)
}

/** A budget that opens three of the plain rig's cells and stops part way into the fourth. */
function threeCellBudgetOf(): BoreGunStats {
  const probe = createScriptedSession()
  const cellTicks = gunTicksOfCell(probe, tileAt(PLAIN_RIG, 1, 0))
  return { ...BORE_STATS, boreBudgetTicks: 3 * cellTicks + Math.floor(cellTicks / 2) }
}

/** The lining types of the lined samples a cell still holds. */
function liningTypesInCell(session: ScriptedSession, tile: TilePoint): (number | null)[] {
  const casing = currentCasingOfChunk(
    session.state().world,
    chunkOfTile(tile.tx),
    chunkOfTile(tile.ty),
  )
  const types = cellSampleIndices(tile)
    .filter((index) => isLined(casing[index]))
    .map((index) => liningTypeIndexOfValue(casing[index]))
  return [...new Set(types)]
}

/** The first tick the gun fires again, never before now. */
function readyTickOf(session: ScriptedSession): number {
  return Math.max(session.state().tick, nextShotTickOf(session.state(), 'p1'))
}

function isLinedAt(session: ScriptedSession, tile: TilePoint): boolean {
  return isCellLined(session.state().world, PARAMS, tile)
}

describe('bore shape: with no shape (ticket 377)', () => {
  it('bores, saves and digests a shot alike with no shotShapeOf and one that answers null', () => {
    const runs = [shapedGun(BORE_STATS), gunShaped(null)].map((slice) =>
      withRegistrations([slice], () => {
        const session = shootEastFrom(PLAIN_RIG)
        return {
          events: session.events(),
          save: JSON.stringify(takeSnapshot(session.state())),
          digest: stateDigest(session.state()),
        }
      }),
    )
    expect(boredTilesOf(runs[0].events)).toHaveLength(4)
    expect(runs[1]).toEqual(runs[0])
  })
})

describe('bore shape: the read (ticket 377)', () => {
  it('reads the shape once per shot, manual or auto, never per tick or per cell', () => {
    const shotShapeOf = vi.fn(() => SPLAY)
    const searGun: SliceDefinition = {
      id: 'probe',
      register(r) {
        r.boreGun({
          id: 'probe.bore-gun',
          boreGunOf: () => ({ ...BORE_STATS, kGunPct: 10000 }),
          autoShootOf: () => SEAR_STATS,
          shotShapeOf,
        })
        r.vehicleItemResearch({
          id: 'probe.research',
          isResearched: (_state, _playerId, itemId) => itemId === STEAM_SEAR_ITEM_ID,
        })
      },
    }
    withRegistrations([searGun], () => {
      const session = createScriptedSession()
      standInPocket(session, AUTO_RIG, 0)
      session.submit(FIRE_TICK, AUTO_ON)
      session.advanceTo(FIRE_TICK + 200)
      session.submit(FIRE_TICK + 200, AUTO_OFF)
      session.submit(readyTickOf(session), FIRE_EAST)
      session.advanceTo(nextShotTickOf(session.state(), 'p1'))
      const shots = ofType(session.events(), 'BoreFired')
      expect(ofType(session.events(), 'AutoActed').length).toBeGreaterThan(0)
      expect(shots.length).toBeGreaterThan(ofType(session.events(), 'AutoActed').length)
      expect(shotShapeOf).toHaveBeenCalledTimes(shots.length)
    })
  })
})

describe('bore shape: lines share one budget (ticket 377, VS on #318)', () => {
  it('spends no more over two splay lines than one line does on the same ground', () => {
    const stats = threeCellBudgetOf()
    const single = withRegistrations([gunShaped(null, stats)], () => shootEastFrom(PLAIN_RIG))
    const splay = withRegistrations([gunShaped(SPLAY, stats)], () => shootEastFrom(PLAIN_RIG))
    expect(spentOfShot(splay)).toBeLessThanOrEqual(stats.boreBudgetTicks)
    expect(spentOfShot(splay)).toBe(spentOfShot(single))
    expect(summedGunTicksOf(splay)).toBe(spentOfShot(splay))
    expect(ofType(splay.events(), 'BoreEnded')).toMatchObject([
      { stop: 'budget' },
      { stop: 'budget' },
    ])
  })

  it('bores both lines of a splay, each through its own cells', () =>
    withRegistrations([gunShaped(SPLAY)], () => {
      const bored = boredTilesOf(shootEastFrom(PLAIN_RIG).events())
      expect(bored).toEqual(
        expect.arrayContaining([tileAt(PLAIN_RIG, 2, -1), tileAt(PLAIN_RIG, 4, 0)]),
      )
    }))

  it('opens a cell two lines share once, on the first line to reach it', () =>
    withRegistrations([gunShaped(SPLAY)], () => {
      const session = shootEastFrom(PLAIN_RIG)
      const shared = tileAt(PLAIN_RIG, 1, 0)
      const opened = boredTilesOf(session.events()).filter(
        (tile) => tile.tx === shared.tx && tile.ty === shared.ty,
      )
      expect(opened).toHaveLength(1)
      expect(summedGunTicksOf(session)).toBe(spentOfShot(session))
    }))

  it('keeps one recovery for the whole shot, from the dig ticks of every line', () =>
    withRegistrations([gunShaped(SPLAY)], () => {
      const session = shootEastFrom(PLAIN_RIG)
      const clocks = new Set((session.state().bores ?? []).map((bore) => bore.nextShotTick))
      expect(clocks.size).toBe(1)
      const spent = spentOfShot(session)
      const recovery = Math.max(
        BORE_STATS.cooldownTicks,
        Math.ceil((spent * 100) / BORE_STATS.kGunPct),
      )
      expect([...clocks][0]).toBe(FIRE_TICK + recovery)
    }))

  it('spends within the budget along a seam turn, as the straight line does', () => {
    const stats = { ...BORE_STATS, rangeCells: 8, boreBudgetTicks: 600 }
    const straight = withRegistrations([gunShaped(null, stats)], () => shootEastFrom(ORE_RIG))
    const turned = withRegistrations([gunShaped(SEAM_TURN, stats)], () => shootEastFrom(ORE_RIG))
    expect(spentOfShot(straight)).toBeLessThanOrEqual(stats.boreBudgetTicks)
    expect(spentOfShot(turned)).toBeLessThanOrEqual(stats.boreBudgetTicks)
    expect(summedGunTicksOf(turned)).toBe(spentOfShot(turned))
  })

  it('follows the seam one row down where the ore bends, and leaves the straight cell', () =>
    withRegistrations([gunShaped(SEAM_TURN, { ...BORE_STATS, rangeCells: 8 })], () => {
      const bored = boredTilesOf(shootEastFrom(ORE_RIG).events())
      expect(bored.slice(-2)).toEqual([tileAt(ORE_RIG, 6, -1), tileAt(ORE_RIG, 7, -1)])
      expect(bored).not.toContainEqual(tileAt(ORE_RIG, 7, 0))
    }))

  it('spends the same budget when the shot lines its walls', () => {
    const stats = threeCellBudgetOf()
    const single = withRegistrations([gunShaped(null, stats)], () => shootEastFrom(PLAIN_RIG))
    const lined = withRegistrations([gunShaped(LINING, stats)], () => shootEastFrom(PLAIN_RIG))
    expect(spentOfShot(lined)).toBe(spentOfShot(single))
  })
})

describe('bore shape: gates on every line (ticket 377, HS on #318)', () => {
  /** Six cells: due east, and a line 20 steps below that drops to the ore row under it. */
  const SIX_CELLS = { ...BORE_STATS, rangeCells: 6 }
  const NEAR_SPLAY: ShotShape = { ...ONE_LINE, lineOffsets: [-20] }

  it('refuses a gated cell on an offset line and opens nothing past it, while the aimed line goes on', () => {
    const gated = tileAt(ORE_RIG, 4, -1)
    const gun = shapedGun(
      SIX_CELLS,
      () => NEAR_SPLAY,
      (r) => r.gateCheck(gateOnTile(gated, 'refused', 'dynamite')),
    )
    withRegistrations([gun], () => {
      const session = shootEastFrom(ORE_RIG)
      const bored = boredTilesOf(session.events())
      expect(bored).not.toContainEqual(gated)
      expect(bored).not.toContainEqual(tileAt(ORE_RIG, 5, -1))
      expect(bored).toContainEqual(tileAt(ORE_RIG, 6, 0))
      expect(ofType(session.events(), 'BoreEnded')).toEqual(
        expect.arrayContaining([expect.objectContaining({ stop: 'refused', ...gated })]),
      )
    })
  })

  it('refuses a gated cell on the aimed line of a splay as a single line refuses it', () => {
    const gated = tileAt(ORE_RIG, 4, 0)
    const gun = shapedGun(
      SIX_CELLS,
      () => NEAR_SPLAY,
      (r) => r.gateCheck(gateOnTile(gated, 'blocked', 'rig')),
    )
    withRegistrations([gun], () => {
      const bored = boredTilesOf(shootEastFrom(ORE_RIG).events())
      expect(bored).not.toContainEqual(gated)
      expect(bored).not.toContainEqual(tileAt(ORE_RIG, 5, 0))
      expect(bored).not.toContainEqual(tileAt(ORE_RIG, 6, 0))
      expect(bored).toContainEqual(tileAt(ORE_RIG, 5, -1))
    })
  })
})

describe('bore shape: lining and extra energy (ticket 377)', () => {
  it("lines the walls of the cells it opened in the grade's lining type", () =>
    withRegistrations([gunShaped(LINING)], () => {
      const session = shootEastFrom(PLAIN_RIG)
      const refractory = liningTypeIndexOf('refractory')
      for (const dx of [1, 2, 3, 4]) {
        expect(liningTypesInCell(session, tileAt(PLAIN_RIG, dx, 1))).toEqual([refractory])
        expect(liningTypesInCell(session, tileAt(PLAIN_RIG, dx, -1))).toEqual([refractory])
      }
      expect(isLinedAt(session, tileAt(PLAIN_RIG, 5, 0))).toBe(true)
      expect(isLinedAt(session, tileAt(PLAIN_RIG, 2, 2))).toBe(false)
      expect(ofType(session.events(), 'CasingPlaced')).toMatchObject([
        { grade: session.vehicle().casingGrade },
      ])
    }))

  it('never lines round a cell it only passed through, already open', () => {
    const gun = { stats: { ...BORE_STATS, rangeCells: 2, collapseHoldTicks: 1000 } }
    const shape: { now: ShotShape | null } = { now: null }
    const slice: SliceDefinition = {
      id: 'probe',
      register(r) {
        r.boreGun({
          id: 'probe.bore-gun',
          boreGunOf: () => gun.stats,
          shotShapeOf: () => shape.now,
        })
      },
    }
    withRegistrations([slice], () => {
      const session = createScriptedSession()
      standInPocket(session, PLAIN_RIG, 0)
      session.submit(FIRE_TICK, FIRE_EAST)
      session.advanceTo(END_TICK)
      gun.stats = { ...gun.stats, rangeCells: 4 }
      shape.now = LINING
      session.submit(readyTickOf(session), FIRE_EAST)
      session.advanceTo(readyTickOf(session))
      expect(boredTilesOf(session.events())).toHaveLength(4)
      for (const dy of [1, -1]) {
        expect(isLinedAt(session, tileAt(PLAIN_RIG, 1, dy))).toBe(false)
        expect(isLinedAt(session, tileAt(PLAIN_RIG, 2, dy))).toBe(false)
        expect(isLinedAt(session, tileAt(PLAIN_RIG, 3, dy))).toBe(true)
        expect(isLinedAt(session, tileAt(PLAIN_RIG, 4, dy))).toBe(true)
      }
    })
  })

  it('lines nothing and logs no placement with no lining grade', () =>
    withRegistrations([gunShaped(SPLAY)], () => {
      const session = shootEastFrom(PLAIN_RIG)
      expect(ofType(session.events(), 'CasingPlaced')).toEqual([])
      expect(isLinedAt(session, tileAt(PLAIN_RIG, 1, 1))).toBe(false)
    }))

  it("adds the shape's extra energy to each cell's share of the drill's dig energy", () => {
    const extra = { ...ONE_LINE, extraEnergyPerCellBp: 10000 }
    withRegistrations([gunShaped(extra)], () => {
      const session = createScriptedSession()
      standInPocket(session, PLAIN_RIG, 0)
      session.advanceTo(1)
      const before = session.vehicle().energy
      const drillStats = heatThrottledDrill(1, session.vehicle())
      const share = BORE_STATS.energyPerCellBp + extra.extraEnergyPerCellBp
      const expected = [1, 2, 3, 4]
        .map((dx) => tileAt(PLAIN_RIG, dx, 0))
        .map((tile) => ticksPerCell(drillStats, PARAMS, tile, cellAt(EMPTY_WORLD, PARAMS, tile)))
        .map((ticks) => boreCellEnergy(ticks as number, share))
        .reduce((sum, energy) => sum + energy, 0)
      session.submit(FIRE_TICK, FIRE_EAST)
      session.advanceTo(END_TICK)
      expect(before - session.vehicle().energy).toBe(expected)
    })
  })

  it('saves and restores a lining shot mid-bore, its lining type kept', () =>
    withRegistrations([gunShaped(LINING)], () => {
      const session = createScriptedSession()
      standInPocket(session, PLAIN_RIG, 0)
      session.submit(FIRE_TICK, FIRE_EAST)
      session.advanceTo(FIRE_TICK + 3)
      const snapshot = takeSnapshot(session.state())
      const restored = readSnapshot(JSON.parse(JSON.stringify(snapshot)))
      if (!('state' in restored) || restored.problems.length > 0) throw new Error('refused')
      expect(restored.state.bores?.[0].shot.liningType).toBe('refractory')
      expect(stateDigest(restored.state)).toBe(stateDigest(session.state()))
    }))
})
