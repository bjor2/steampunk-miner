import { describe, expect, it } from 'vitest'
import { COLLAPSE_VEHICLE_CLEARANCE_MM } from '../../../constants/balance'
import { withRegistrations } from '../../../registries/registrar'
import { boreGunOf } from '../../registries/boreGun'
import { feedbackCuesOf } from '../../feedback/feedbackCues'
import { LOCKED_SCHEDULE } from '../../unlocks/unlockSchedule'
import { cellDensitySum } from '../../world/cellYield'
import { blockContaining, blockIdOf } from '../../world/collapseBlock'
import { MM_PER_SAMPLE, SAMPLES_PER_CELL, SOLID_DENSITY } from '../../world/sampleGrid'
import { isSolidAt, openSampleLayers } from '../../world/sampleLayers'
import type { TilePoint } from '../../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../world/worldCell'
import { cellAt, EMPTY_WORLD } from '../../world/worldState'
import { ofType, poseOnTile } from '../charges/chargeFixtures'
import { COLLAPSE_FILL_TICKS, COLLAPSE_WARN_TICKS } from '../../../constants/balance'
import { isClankStop, type DomainEvent } from '../domainEvent'
import { drill, PARAMS, createScriptedSession, type ScriptedSession } from '../scriptedSession'
import { readSnapshot, takeSnapshot } from '../sessionSnapshot'
import { stateDigest } from '../stateDigest'
import { ticksPerCell } from '../groundDrill'
import { heatThrottledDrill } from '../heatRules'
import { advanceTicks } from '../advanceTicks'
import { boreCellEnergy } from './boreCell'
import { boreFireRule } from './boreFire'
import {
  BORE_STATS,
  boreGunSlice,
  fireAt,
  FIRE_EAST,
  gateOnTile,
  lineEastOf,
  ORE_RIG,
  PLAIN_RIG,
  standInPocket,
} from './boreFixtures'

const FIRE_TICK = 10
const SOLID_CELL = SAMPLES_PER_CELL * SOLID_DENSITY
const STEP_RATES = [30, 144] as const
/** Twice band 1's dig time at the rig's level, inside a scripted drill's tick budget. */
const REDIG_TICKS = 100

/** A planet-1 session with the rig standing in its pocket at `rig`. */
function rigAt(rig: TilePoint): ScriptedSession {
  const session = createScriptedSession()
  standInPocket(session, rig, 0)
  return session
}

/** Moves the session to `toTick` in render frames of `stepsPerSecond`, as the live loop does. */
function advanceInFrames(session: ScriptedSession, toTick: number, stepsPerSecond: number): void {
  const fromTick = session.state().tick
  for (let frame = 1; session.state().tick < toTick; frame++) {
    const tick = Math.min(toTick, fromTick + Math.floor((frame * 60) / stepsPerSecond))
    if (tick > session.state().tick) session.advanceTo(tick)
  }
}

function boredTilesOf(events: readonly DomainEvent[]) {
  return ofType(events, 'TileDestroyed')
    .filter((event) => event.cause === 'bore')
    .map(({ tx, ty, tick }) => ({ tx, ty, tick }))
}

function tilesOnly(bored: readonly { tx: number; ty: number }[]): TilePoint[] {
  return bored.map(({ tx, ty }) => ({ tx, ty }))
}

function densityOf(session: ScriptedSession, tile: TilePoint): number {
  return cellDensitySum(session.state().world, PARAMS, tile)
}

/** Fires `intent` from `rig` at the fire tick and runs the clock to `toTick`. */
function shootFrom(rig: TilePoint, intent = FIRE_EAST, toTick = FIRE_TICK + 20): ScriptedSession {
  const session = rigAt(rig)
  session.submit(FIRE_TICK, intent)
  session.advanceTo(toTick)
  return session
}

/** The drill's own dig ticks for a cell of the generated planet, at the rig's level. */
function drillTicksOfCell(session: ScriptedSession, tile: TilePoint): number {
  const vehicle = session.vehicle()
  const drillStats = heatThrottledDrill(1, vehicle)
  return ticksPerCell(drillStats, PARAMS, tile, cellAt(EMPTY_WORLD, PARAMS, tile)) as number
}

describe('ground gun: the fixtures (ticket 313)', () => {
  it('stands both rigs in band-1 rock with four solid cells east, ore third and fourth on one', () => {
    const kinds = (rig: TilePoint) =>
      lineEastOf(rig).map((tile) => kindOfCell(cellAt(EMPTY_WORLD, PARAMS, tile)))
    expect(kinds(PLAIN_RIG)).toEqual([2, 2, 2, 2].map(() => CELL_KIND.ground))
    expect(kinds(ORE_RIG)).toEqual([
      CELL_KIND.ground,
      CELL_KIND.ground,
      CELL_KIND.ore,
      CELL_KIND.ore,
    ])
  })
})

describe('ground gun: the bored line (ticket 313, #309 tests 1, 3 and 9)', () => {
  it('bores the identical cells for the same seed, bearing and drill power at 30 and 144 steps/s', () =>
    withRegistrations([boreGunSlice()], () => {
      const runs = STEP_RATES.map((rate) => {
        const session = rigAt(PLAIN_RIG)
        session.submit(FIRE_TICK, fireAt(200))
        advanceInFrames(session, 400, rate)
        return { bored: boredTilesOf(session.events()), digest: stateDigest(session.state()) }
      })
      expect(runs[0].bored).toHaveLength(4)
      expect(runs[1]).toEqual(runs[0])
    }))

  it('opens the cells at fire +2, +4, +6 and +8 ticks at 30 and 144 steps/s', () =>
    withRegistrations([boreGunSlice()], () => {
      for (const rate of STEP_RATES) {
        const session = rigAt(PLAIN_RIG)
        session.submit(FIRE_TICK, FIRE_EAST)
        advanceInFrames(session, FIRE_TICK + 20, rate)
        expect(boredTilesOf(session.events())).toEqual(
          lineEastOf(PLAIN_RIG).map((tile, at) => ({ ...tile, tick: FIRE_TICK + 2 * (at + 1) })),
        )
      }
    }))

  it('ends a line that walked its range quietly, at its last cell', () =>
    withRegistrations([boreGunSlice()], () => {
      const ended = ofType(shootFrom(PLAIN_RIG).events(), 'BoreEnded')
      expect(ended).toMatchObject([
        { stop: 'range', ...lineEastOf(PLAIN_RIG)[3], cellsOpened: 4, tick: FIRE_TICK + 8 },
      ])
      expect(isClankStop(ended[0].stop)).toBe(false)
    }))

  it('bores the cells of the 60 degree edge for straight down and 75 degrees below horizontal', () =>
    withRegistrations([boreGunSlice()], () => {
      const cellsOf = (bearing: number) =>
        tilesOnly(boredTilesOf(shootFrom(PLAIN_RIG, fireAt(bearing)).events()))
      const leftEdge = cellsOf(85)
      expect(leftEdge).toHaveLength(4)
      expect(cellsOf(127)).toEqual(leftEdge)
      expect(cellsOf(106)).toEqual(leftEdge)
      expect(cellsOf(128)).toEqual(cellsOf(170))
    }))

  it('clamps a raw out-of-arc bearing and never bores it as sent', () =>
    withRegistrations([boreGunSlice()], () => {
      const session = shootFrom(PLAIN_RIG, fireAt(127))
      expect(ofType(session.events(), 'BoreFired')).toMatchObject([
        { aimed: 127, bearing: 85, rangeCells: 4 },
      ])
      const sent = tilesOnly(boredTilesOf(session.events()))
      const leftEdge = tilesOnly(boredTilesOf(shootFrom(PLAIN_RIG, fireAt(85)).events()))
      expect(sent).toEqual(leftEdge)
      expect(sent.filter((tile) => tile.tx < PLAIN_RIG.tx).length).toBeGreaterThan(1)
    }))

  it('refuses a bearing past the table', () =>
    withRegistrations([boreGunSlice()], () => {
      const refused = rigAt(PLAIN_RIG).submit(FIRE_TICK, fireAt(256))
      expect(refused).toMatchObject([{ type: 'CommandRejected', reason: 'out_of_range' }])
    }))
})

describe('ground gun: penetration through the drill path (ticket 313, #309 test 2)', () => {
  it('opens cells 1 and 2, nothing past an undiggable third cell, and clanks there', () => {
    const third = lineEastOf(ORE_RIG)[2]
    const gate = boreGunSlice(BORE_STATS, (r) =>
      r.gateCheck(gateOnTile(third, 'refused', 'dynamite')),
    )
    withRegistrations([gate], () => {
      const session = shootFrom(ORE_RIG)
      expect(tilesOnly(boredTilesOf(session.events()))).toEqual(lineEastOf(ORE_RIG).slice(0, 2))
      const [ended] = ofType(session.events(), 'BoreEnded')
      expect(ended).toMatchObject({ stop: 'refused', ...third, cellsOpened: 2 })
      expect(isClankStop(ended.stop)).toBe(true)
      expect(feedbackCuesOf(session.events(), 'p1')).toContainEqual({ kind: 'boreClank' })
      expect(
        lineEastOf(ORE_RIG)
          .slice(2)
          .map((tile) => densityOf(session, tile)),
      ).toEqual([SOLID_CELL, SOLID_CELL])
    })
  })

  it('stops at a dynamite-gated cell through the drill gates, saying so', () => {
    const third = lineEastOf(ORE_RIG)[2]
    const gate = boreGunSlice(BORE_STATS, (r) =>
      r.gateCheck(gateOnTile(third, 'refused', 'dynamite')),
    )
    withRegistrations([gate], () => {
      const session = shootFrom(ORE_RIG)
      expect(ofType(session.events(), 'DrillGated')).toMatchObject([
        { ...third, gateKind: 'dynamite', outcome: 'refused' },
      ])
      expect(boredTilesOf(session.events())).toHaveLength(2)
    })
  })

  it('stops at a rig-gated cell the gate blocks, with nothing opened past it', () => {
    const third = lineEastOf(ORE_RIG)[2]
    const gate = boreGunSlice(BORE_STATS, (r) => r.gateCheck(gateOnTile(third, 'blocked', 'rig')))
    withRegistrations([gate], () => {
      const session = shootFrom(ORE_RIG)
      expect(ofType(session.events(), 'DrillGated')).toMatchObject([
        { ...third, gateKind: 'rig', outcome: 'blocked' },
      ])
      expect(ofType(session.events(), 'BoreEnded')).toMatchObject([{ stop: 'refused', ...third }])
      expect(densityOf(session, lineEastOf(ORE_RIG)[3])).toBe(SOLID_CELL)
    })
  })

  it("stops at a cell under the drill's own scratch floor", () => {
    const third = lineEastOf(ORE_RIG)[2]
    const signatureAtThird = boreGunSlice(BORE_STATS, (r) =>
      r.oreDrillClass({
        id: 'probe.signature-class',
        drillClassOf: ({ tile }) =>
          tile.tx === third.tx && tile.ty === third.ty ? 'signature' : 'ordinary',
      }),
    )
    withRegistrations([signatureAtThird], () => {
      const session = shootFrom(ORE_RIG)
      expect(drillTicksOfCell(session, third)).toBeNull()
      expect(ofType(session.events(), 'BoreEnded')).toMatchObject([
        { stop: 'refused', ...third, cellsOpened: 2 },
      ])
    })
  })

  it('digs at gunFactor times drill power: a budget for two cells opens two, then stops quietly', () =>
    withRegistrations([boreGunSlice()], () => {
      const probe = rigAt(PLAIN_RIG)
      const drillTicks = drillTicksOfCell(probe, lineEastOf(PLAIN_RIG)[1])
      const twoCells = { ...BORE_STATS, boreBudgetTicks: 2 * 2 * drillTicks }
      withRegistrations([boreGunSlice(twoCells)], () => {
        const session = shootFrom(PLAIN_RIG)
        expect(boredTilesOf(session.events())).toHaveLength(2)
        expect(ofType(session.events(), 'BoreEnded')).toMatchObject([{ stop: 'budget' }])
      })
    }))

  it("debits each opened cell at the shot's share of the drill's own dig energy", () =>
    withRegistrations([boreGunSlice()], () => {
      const session = rigAt(PLAIN_RIG)
      const before = session.vehicle().energy
      const expected = lineEastOf(PLAIN_RIG)
        .map((tile) => boreCellEnergy(drillTicksOfCell(session, tile), BORE_STATS.energyPerCellBp))
        .reduce((sum, energy) => sum + energy, 0)
      session.submit(FIRE_TICK, FIRE_EAST)
      session.advanceTo(FIRE_TICK + 20)
      expect(before - session.vehicle().energy).toBe(expected)
    }))

  it('credits no ore for a bored ore cell: it yields loose and the hold stays empty', () =>
    withRegistrations([boreGunSlice()], () => {
      const session = shootFrom(ORE_RIG)
      expect(
        ofType(session.events(), 'TileDestroyed').filter((event) => event.kind === 'ore'),
      ).toHaveLength(2)
      expect(ofType(session.events(), 'CargoAdded')).toEqual([])
    }))
})

describe('ground gun: refusals (ticket 313, #309 test 6 and the Horizontal pins)', () => {
  it('refuses a second shot inside the cooldown and spends nothing', () =>
    withRegistrations([boreGunSlice()], () => {
      const session = shootFrom(PLAIN_RIG)
      const before = stateDigest(session.state())
      const refused = session.submit(FIRE_TICK + 30, FIRE_EAST)
      expect(refused).toMatchObject([{ type: 'CommandRejected', reason: 'bore_cooling' }])
      expect(stateDigest(session.state())).toBe(before)
    }))

  it('fires again once the cooldown has run', () =>
    withRegistrations([boreGunSlice()], () => {
      const session = shootFrom(PLAIN_RIG)
      session.submit(FIRE_TICK + BORE_STATS.cooldownTicks, fireAt(0))
      expect(ofType(session.events(), 'BoreFired')).toHaveLength(2)
    }))

  it('refuses a shot before FeatureUnlocked(bore_gun) and spends nothing', () =>
    withRegistrations([boreGunSlice()], () => {
      const later = {
        ...LOCKED_SCHEDULE,
        rows: LOCKED_SCHEDULE.rows.map((row) =>
          row.id === 'bore_gun' ? { ...row, planetIndex: 2 } : row,
        ),
      }
      const state = rigAt(PLAIN_RIG).state()
      const command = { playerId: 'p1', tick: FIRE_TICK, seq: 9, ...FIRE_EAST }
      expect(boreFireRule(later).reject?.(state, command)).toMatchObject({
        reason: 'feature_locked',
      })
      expect(boreFireRule(LOCKED_SCHEDULE).reject?.(state, command)).toBeNull()
    }))

  it('refuses a shot with no bore gun', () =>
    withRegistrations([], () => {
      const refused = rigAt(PLAIN_RIG).submit(FIRE_TICK, FIRE_EAST)
      expect(refused).toMatchObject([{ type: 'CommandRejected', reason: 'no_bore_gun' }])
    }))

  it('refuses a shot whose first cell the tank cannot pay, and spends nothing', () =>
    withRegistrations([boreGunSlice()], () => {
      const session = rigAt(PLAIN_RIG)
      session.submit(1, { type: 'debug.setEnergy', payload: { energy: '0.5' } })
      const before = stateDigest(session.state())
      const refused = session.submit(FIRE_TICK, FIRE_EAST)
      expect(refused).toMatchObject([{ type: 'CommandRejected', reason: 'energy_short' }])
      expect(stateDigest(session.state())).toBe(before)
      expect(boreGunOf(session.state(), 'p1')).toEqual(BORE_STATS)
    }))
})

describe('ground gun: the bore-disturbance collapse (ticket 313, #309 tests 4 and 5)', () => {
  const END_TICK = FIRE_TICK + 8
  const disturbedBlocks = lineEastOf(PLAIN_RIG)
    .map((tile) => blockIdOf(blockContaining({ xMm: tile.tx * 1000 + 500, yMm: 280500 })))
    .filter((id, at, ids) => ids.indexOf(id) === at)

  it('warns every uncased block the bore touched at bore end +30', () =>
    withRegistrations([boreGunSlice()], () => {
      const session = shootFrom(PLAIN_RIG, FIRE_EAST, END_TICK + 40)
      const warned = ofType(session.events(), 'CollapseWarned')
      expect(warned.map(({ block }) => block).sort()).toEqual([...disturbedBlocks].sort())
      expect(warned.map(({ tick }) => tick)).toEqual(disturbedBlocks.map(() => END_TICK + 30))
      expect(warned[0]).toMatchObject({ band: 1, weakestGrade: 0, required: 1 })
    }))

  it('refills the warned blocks after the 60-tick warning, wherever the rig has gone', () =>
    withRegistrations([boreGunSlice()], () => {
      const session = shootFrom(PLAIN_RIG, FIRE_EAST, END_TICK + 31)
      session.submit(END_TICK + 31, poseOnTile({ tx: PLAIN_RIG.tx - 40, ty: PLAIN_RIG.ty }))
      session.advanceTo(END_TICK + 30 + COLLAPSE_WARN_TICKS + COLLAPSE_FILL_TICKS)
      expect(ofType(session.events(), 'CollapseStarted')).toHaveLength(disturbedBlocks.length)
      expect(ofType(session.events(), 'CollapseCancelled')).toEqual([])
      expect(densityOf(session, lineEastOf(PLAIN_RIG)[3])).toBe(SOLID_CELL)
    }))

  it('leaves a block lined at the required grade byte-identical after 600 ticks', () =>
    withRegistrations([boreGunSlice()], () => {
      const session = shootFrom(PLAIN_RIG, FIRE_EAST, END_TICK + 1)
      lineBoreAt(session, END_TICK + 1, 1)
      const lined = stateDigest(session.state().world)
      session.advanceTo(END_TICK + 1 + 600)
      expect(ofType(session.events(), 'CollapseWarned')).toEqual([])
      expect(stateDigest(session.state().world)).toBe(lined)
    }))

  it('never fills the space the rig stands in, while the rest of its block refills', () =>
    withRegistrations([boreGunSlice()], () => {
      const refillTick = END_TICK + 30 + COLLAPSE_WARN_TICKS
      const session = shootFrom(PLAIN_RIG, FIRE_EAST, refillTick - 1)
      const open = airSamplesWithinClearance(session, PLAIN_RIG)
      session.advanceTo(refillTick + COLLAPSE_FILL_TICKS)
      expect(ofType(session.events(), 'CollapseStarted').length).toBeGreaterThan(0)
      expect(open.length).toBeGreaterThan(0)
      expect(airSamplesWithinClearance(session, PLAIN_RIG)).toEqual(open)
      expect(densityOf(session, lineEastOf(PLAIN_RIG)[0])).toBeGreaterThan(0)
    }))

  it('credits no ore when the collapsed block is re-dug, and the wallet stays as it was', () =>
    withRegistrations([boreGunSlice()], () => {
      const session = shootFrom(ORE_RIG, FIRE_EAST, END_TICK + 30 + 90 + 1)
      const wallet = session.state().players.p1.wallet
      const before = session.events().length
      redig(session, ORE_RIG, END_TICK + 200)
      const redug = session.events().slice(before)
      expect(lineEastOf(ORE_RIG).map((tile) => densityOf(session, tile))).toEqual([0, 0, 0, 0])
      expect(ofType(redug, 'TileDestroyed')).toEqual([])
      expect(ofType(redug, 'CargoAdded')).toEqual([])
      expect(session.state().players.p1.wallet).toEqual(wallet)
    }))
})

describe('ground gun: save and digest (ticket 313)', () => {
  it('round-trips a pending bore through a snapshot and fires the same cells after', () =>
    withRegistrations([boreGunSlice()], () => {
      const session = rigAt(PLAIN_RIG)
      session.submit(FIRE_TICK, FIRE_EAST)
      session.advanceTo(FIRE_TICK + 3)
      expect(session.state().bores).toHaveLength(1)
      const loaded = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
      if (!('state' in loaded) || loaded.problems.length > 0) throw new Error('refused')
      const original = advanceTicks(session.state(), 300)
      const resumed = advanceTicks(loaded.state, 300)
      expect(resumed.events).toEqual(original.events)
      expect(stateDigest(resumed.state)).toBe(stateDigest(original.state))
    }))

  it('drops the bore once checked and cooled, leaving no bores key behind', () =>
    withRegistrations([boreGunSlice()], () => {
      const session = shootFrom(PLAIN_RIG, FIRE_EAST, 300)
      expect('bores' in session.state()).toBe(false)
      expect('bores' in takeSnapshot(session.state()).state).toBe(false)
    }))
})

/** Rings every 0.25 m along the bore's axis, from a metre behind its first cell to past its last. */
function lineBoreAt(session: ScriptedSession, tick: number, grade: number): void {
  session.submit(tick, { type: 'debug.setCasingGrade', payload: { grade } })
  const y = PLAIN_RIG.ty * 1000 + 500
  for (let x = PLAIN_RIG.tx * 1000; x <= (PLAIN_RIG.tx + 6) * 1000; x += 250) {
    session.submit(tick, { type: 'debug.lineCasing', payload: { x, y, grade } })
  }
}

/** The open samples within the refill's clearance of the rig's body centre, in row order. */
function airSamplesWithinClearance(session: ScriptedSession, rig: TilePoint): string[] {
  const layers = openSampleLayers(session.state().world, PARAMS)
  const centre = { x: rig.tx * 1000 + 500, y: rig.ty * 1000 + 500 }
  const span = Math.ceil(COLLAPSE_VEHICLE_CLEARANCE_MM / MM_PER_SAMPLE)
  const first = {
    sx: Math.floor(centre.x / MM_PER_SAMPLE),
    sy: Math.floor(centre.y / MM_PER_SAMPLE),
  }
  const open: string[] = []
  for (let sy = first.sy - span; sy <= first.sy + span; sy++) {
    for (let sx = first.sx - span; sx <= first.sx + span; sx++) {
      const dx = sx * MM_PER_SAMPLE - centre.x
      const dy = sy * MM_PER_SAMPLE - centre.y
      const isInside = dx * dx + dy * dy <= COLLAPSE_VEHICLE_CLEARANCE_MM ** 2
      if (isInside && !isSolidAt(layers, sx, sy)) open.push(`${sx},${sy}`)
    }
  }
  return open
}

/** Drills each bored cell from the cell west of it, for twice the band's dig time. */
function redig(session: ScriptedSession, rig: TilePoint, tick: number): void {
  lineEastOf(rig).forEach((tile, at) => {
    const reportTick = tick + at * REDIG_TICKS * 2
    session.submit(reportTick, poseOnTile({ tx: tile.tx - 1, ty: tile.ty }))
    session.submit(reportTick, { type: 'debug.setEnergy', payload: { energy: '150' } })
    session.submit(reportTick + REDIG_TICKS, drill(tile, REDIG_TICKS))
  })
}
