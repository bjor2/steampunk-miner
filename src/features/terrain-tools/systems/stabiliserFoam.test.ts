import { describe, expect, it } from 'vitest'
import { COLLAPSE_WARN_TICKS } from '../../../constants/balance'
import { TICKS_PER_SECOND } from '../../../constants/physics'
import { recordDomainEventsTo } from '../../../logging/domainEventLog'
import { createMemorySink } from '../../../logging/eventSink'
import { createRunLog } from '../../../logging/runLog'
import { runEventProblems } from '../../../logging/runEventSchema'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { advanceTicks } from '../../../systems/authority/advanceTicks'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { buildWeakTunnel } from '../../../systems/authority/collapse/collapseFixtures'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import { BELOW_FLOOR, FLOOR, onHeatPlanet } from '../../../systems/authority/lava/lavaFixtures'
import {
  createScriptedSession,
  PARAMS,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { readSnapshot, takeSnapshot } from '../../../systems/authority/sessionSnapshot'
import { stateDigest } from '../../../systems/authority/stateDigest'
import { NEW_FIXED_STEP_CLOCK, stepsForFrame } from '../../../systems/fixedStepClock'
import { FACING, tileOfPose } from '../../../systems/vehicle/vehiclePose'
import { surfaceRowOfColumn, type TilePoint } from '../../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../../systems/world/worldCell'
import { cellAt, EMPTY_WORLD } from '../../../systems/world/worldState'
import { chargesLeftOf, intentToReleaseSlot } from '../../power-up-core'
import { slice as TERRAIN_TOOLS_SLICE } from '../register'
import { ofType, press, sessionWith, standAt } from '../terrainTestSession'
import { tilesInForwardCone } from './foamCone'
import { openGroundView } from './groundView'
import { bracedBlocksOf, LODE_CLAMP_ID } from './lodeClamp'
import {
  foamableCellsOf,
  foamBracesAt,
  foamedCellsOf,
  sprayFoam,
  STABILISER_FOAM_ID,
} from './stabiliserFoam'
import { editSourceOf } from './terrainOutcome'
import { terrainToolsOf, terrainToolsStateProblems } from './terrainSection'

// Stabiliser foam (the GD default ruling and the HS and VS pins on #381, ticket 381): a spray sets
// foam on a forward cone of radius 2, never on a gated, core or lava cell, and holds every collapse
// block under a set cell for 600 ticks through a timed `collapseBraces` provider beside the lode
// clamp's. When the foam lapses the block warns afresh for 60 ticks; spraying again moves the end
// on, never adds to it, and a clamp over the same block never stacks with it. The scene is the
// collapse specs' weak band-2 tunnel: its blocks warn on tick 10 and would refill on tick 70.

const FOAM_SLOT = { 'powerup.1': STABILISER_FOAM_ID }
const WARN_TICK = 10
const REFILL_TICK = WARN_TICK + COLLAPSE_WARN_TICKS
/** Foam is a consumable with no wind-up: it acts on the press. */
const SPRAY_TICK = 20
const BRACE_TICKS = 600
const LAPSE_TICK = SPRAY_TICK + BRACE_TICKS
const STEP_RATES = [30, 144] as const

/** The weak tunnel with `slots` filled, warning from `WARN_TICK`. */
function foamTunnel(slots: Readonly<Record<string, string>> = FOAM_SLOT): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, setVehicleLoadoutCommand(slots))
  buildWeakTunnel(session, WARN_TICK)
  return session
}

/** The tunnel with foam sprayed on `SPRAY_TICK`. */
function sprayedTunnel(): ScriptedSession {
  const session = foamTunnel()
  session.submit(SPRAY_TICK, press())
  return session
}

const blocksOf = (events: readonly DomainEvent[], type: 'CollapseWarned' | 'CollapseBraced') =>
  ofType(events, type).map((event) => ('block' in event ? event.block : ''))

const ticksOf = (session: ScriptedSession, type: string, block: string) =>
  ofType(session.events(), type)
    .filter((event) => 'block' in event && event.block === block)
    .map(({ tick }) => tick)

const claimedBlocks = (state: AuthorityState, tick: number) =>
  foamBracesAt(state, tick).map(({ block }) => block)

function foamLines(events: readonly DomainEvent[]) {
  const sink = createMemorySink()
  const runLog = createRunLog({ runId: 'run_381', sink, secondsSinceStart: () => 0 })
  recordDomainEventsTo(runLog, { playerId: 'p1', planet: 1, depthTiles: 0 }, events)
  return sink.events.filter((line) => (line.event as string) === 'terrain-tools.foam_set')
}

describe('stabiliser foam: the cone', () => {
  it('sprays a forward cone of radius 2: four cells ahead, never the rig tile or behind', () => {
    const cone = tilesInForwardCone({ tx: 0, ty: 0 }, { x: 1, y: 0 }, 2)
    expect(cone).toEqual([
      { tx: 1, ty: -1 },
      { tx: 1, ty: 0 },
      { tx: 1, ty: 1 },
      { tx: 2, ty: 0 },
    ])
  })

  it('reaches four cells deep at the capped radius, and turns with a diagonal facing', () => {
    const wide = tilesInForwardCone({ tx: 0, ty: 0 }, { x: 1, y: 0 }, 4)
    expect(Math.max(...wide.map(({ tx }) => tx))).toBe(4)
    expect(wide.every(({ tx, ty }) => tx > 0 && Math.abs(ty) <= tx)).toBe(true)
    const diagonal = tilesInForwardCone({ tx: 0, ty: 0 }, { x: 1, y: 1 }, 2)
    expect(diagonal).toContainEqual({ tx: 1, ty: 1 })
    expect(diagonal.every(({ tx, ty }) => tx + ty > 0 && Math.abs(tx - ty) <= tx + ty)).toBe(true)
  })

  it('sets foam on the cone ahead of the rig, uses one unit and logs foam_set', () => {
    const session = sprayedTunnel()
    const rig = tileOfPose(session.vehicle().pose!)
    const cells = foamedCellsOf(session.state(), 'p1')
    expect(cells.map(({ tx, ty }) => ({ tx, ty }))).toEqual(
      tilesInForwardCone(rig, { x: 1, y: 0 }, 2),
    )
    expect(cells.every((cell) => cell.untilTick === LAPSE_TICK)).toBe(true)
    expect(chargesLeftOf(session.state(), 'p1', STABILISER_FOAM_ID)).toBe(3)
    const lines = foamLines(session.events())
    expect(lines.map((line) => line.data)).toEqual([
      { mark: 0, origin: rig, cellsSet: cells.length, untilTick: LAPSE_TICK },
    ])
    expect(lines.flatMap(runEventProblems)).toEqual([])
  })

  it('changes no cell, so foamed cells keep their hardness and band price byte for byte', () => {
    const session = foamTunnel()
    session.advanceTo(SPRAY_TICK)
    const before = JSON.stringify(session.state().world)
    session.submit(SPRAY_TICK, press())
    expect(foamedCellsOf(session.state(), 'p1').length).toBeGreaterThan(0)
    expect(JSON.stringify(session.state().world)).toBe(before)
  })
})

describe('stabiliser foam: never on gated, core or lava cells', () => {
  it.each(['rig', 'dynamite'])('sets no foam on a %s-gated cell', (gateKind) => {
    withRegistrations([TERRAIN_TOOLS_SLICE, gateProbeOf(gateKind)], () => {
      const ore = buriedOreTile()
      const ground = { tx: ore.tx - 1, ty: ore.ty }
      expect(foamableOn(sessionWith({}).state(), [ore, ground])).toEqual([ground])
    })
  })

  it('sets no foam on a core cell', () => {
    const core = { tx: 0, ty: 0 }
    expect(kindOfCell(cellAt(EMPTY_WORLD, PARAMS, core))).toBe(CELL_KIND.core)
    expect(foamableOn(sessionWith({}).state(), [core])).toEqual([])
  })

  it('sets no foam on lava', () => {
    expect(foamableOn(onHeatPlanet().state(), [FLOOR, BELOW_FLOOR])).toEqual([BELOW_FLOOR])
  })

  it('is refused with nothing to set facing the core, and costs nothing', () => {
    const session = sessionWith(FOAM_SLOT)
    standAt(session, 5, { tx: -3, ty: 0 }, FACING.right)
    session.submit(SPRAY_TICK, press())
    expect(ofType(session.events(), 'power-up-core.PowerUpRefused')).toMatchObject([
      { itemId: STABILISER_FOAM_ID, reason: 'terrain-tools.nothing_to_foam' },
    ])
    expect(chargesLeftOf(session.state(), 'p1', STABILISER_FOAM_ID)).toBe(4)
  })
})

describe('stabiliser foam: ownership', () => {
  it('refuses a spray by a player who does not own foam, and sets nothing', () => {
    const state = foamTunnel({}).state()
    const outcome = sprayFoam(state, {
      playerId: 'p1',
      itemId: STABILISER_FOAM_ID,
      slot: 'powerup.1',
      tick: SPRAY_TICK,
      origin: tileOfPose(state.players.p1.vehicle.pose!),
      mark: 0,
      magnitude: null,
    })
    expect(outcome).toEqual({ kind: 'refused', reason: 'terrain-tools.not_owned' })
  })

  it('braces nothing once foam is no longer owned', () => {
    const session = sprayedTunnel()
    expect(claimedBlocks(session.state(), SPRAY_TICK).length).toBeGreaterThan(0)
    session.submit(SPRAY_TICK + 10, setVehicleLoadoutCommand({}))
    expect(claimedBlocks(session.state(), SPRAY_TICK + 10)).toEqual([])
  })
})

describe('stabiliser foam: the timed brace', () => {
  it('braces every warning block holding a set cell on the spray tick, and no other', () => {
    const session = sprayedTunnel()
    const warned = new Set(blocksOf(session.events(), 'CollapseWarned'))
    const expected = claimedBlocks(session.state(), SPRAY_TICK).filter((block) => warned.has(block))
    expect(expected.length).toBeGreaterThan(0)
    expect(blocksOf(session.events(), 'CollapseBraced').sort()).toEqual(expected)
    const braced = ofType(session.events(), 'CollapseBraced')
    expect(braced.map(({ tick }) => tick)).toEqual(expected.map(() => SPRAY_TICK))
    expect(braced).toMatchObject(expected.map(() => ({ by: ['terrain-tools.stabiliser-foam'] })))
  })

  it('holds its blocks past their refill for 600 ticks, then warns them afresh for 60', () => {
    const session = sprayedTunnel()
    session.advanceTo(LAPSE_TICK + COLLAPSE_WARN_TICKS + 10)
    const braced = blocksOf(session.events(), 'CollapseBraced')
    expect(braced.length).toBeGreaterThan(0)
    for (const block of braced) {
      expect(ticksOf(session, 'CollapseWarned', block)).toEqual([WARN_TICK, LAPSE_TICK])
      expect(ticksOf(session, 'CollapseStarted', block)).toEqual([LAPSE_TICK + COLLAPSE_WARN_TICKS])
    }
    const unbraced = blocksOf(session.events(), 'CollapseWarned').filter(
      (block) => !braced.includes(block),
    )
    expect(unbraced.flatMap((block) => ticksOf(session, 'CollapseStarted', block))).toEqual(
      unbraced.map(() => REFILL_TICK),
    )
  })

  it('moves the end on when sprayed again, never adding the times', () => {
    const again = SPRAY_TICK + 200
    const session = sprayedTunnel()
    session.submit(again, press())
    session.advanceTo(again + BRACE_TICKS + COLLAPSE_WARN_TICKS + 10)
    const braced = blocksOf(session.events(), 'CollapseBraced')
    expect(braced.length).toBeGreaterThan(0)
    for (const block of braced) {
      expect(ticksOf(session, 'CollapseWarned', block)).toEqual([WARN_TICK, again + BRACE_TICKS])
    }
  })

  it('keeps a cell once, its first spray as its start, when sprayed again', () => {
    const session = sprayedTunnel()
    const first = foamedCellsOf(session.state(), 'p1')
    session.submit(SPRAY_TICK + 200, press())
    const refreshed = foamedCellsOf(session.state(), 'p1')
    expect(refreshed).toEqual(
      first.map((cell) => ({ ...cell, untilTick: SPRAY_TICK + 200 + BRACE_TICKS })),
    )
  })

  it('never stacks with a lode clamp over the same block: it ends at the later end', () => {
    const session = foamTunnel({ 'powerup.1': STABILISER_FOAM_ID, 'powerup.2': LODE_CLAMP_ID })
    session.submit(SPRAY_TICK, press())
    session.submit(SPRAY_TICK, press('powerup.2'))
    session.advanceTo(50)
    const clamped = new Set(bracedBlocksOf(session.state(), 'p1'))
    const braced = new Set(blocksOf(session.events(), 'CollapseBraced'))
    const both = claimedBlocks(session.state(), 50).filter(
      (block) => clamped.has(block) && braced.has(block),
    )
    expect(both.length).toBeGreaterThan(0)
    session.submit(100, intentToReleaseSlot('powerup.2'))
    session.advanceTo(LAPSE_TICK + COLLAPSE_WARN_TICKS + 10)
    for (const block of both) {
      expect(ticksOf(session, 'CollapseWarned', block)).toEqual([WARN_TICK, LAPSE_TICK])
    }
  })

  it('braces nothing on another planet, as block ids repeat from planet to planet', () => {
    const session = sprayedTunnel()
    session.submit(SPRAY_TICK + 1, { type: 'debug.setPlanet', payload: { planetIndex: 2 } })
    expect(session.state().planet.index).toBe(2)
    expect(claimedBlocks(session.state(), SPRAY_TICK + 1)).toEqual([])
  })

  it('drops every cell as it lapses, leaving the section as before foam', () => {
    const session = sprayedTunnel()
    session.advanceTo(LAPSE_TICK)
    expect(terrainToolsOf(session.state(), 'p1')).toEqual({ beacon: null })
    expect(ofType(session.submit(LAPSE_TICK, press()), 'power-up-core.PowerUpUsed')).toHaveLength(1)
  })
})

describe('stabiliser foam: replay and save', () => {
  it('ends in the same state with the same events at 30 and 144 steps/s', () => {
    const runs = STEP_RATES.map((rate) => {
      const session = foamTunnel()
      session.submit(SPRAY_TICK, press())
      stepInFrames(session, rate, LAPSE_TICK + COLLAPSE_WARN_TICKS + 10)
      return { events: session.events(), digest: stateDigest(session.state()) }
    })
    expect(runs[1]).toEqual(runs[0])
  })

  it('keeps the foam and its braces across a save taken mid-brace', () => {
    const session = sprayedTunnel()
    session.advanceTo(REFILL_TICK + 10)
    const loaded = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
    if (!('state' in loaded)) throw new Error(loaded.problems.join('; '))
    expect(foamedCellsOf(loaded.state, 'p1')).toEqual(foamedCellsOf(session.state(), 'p1'))
    const original = advanceTicks(session.state(), BRACE_TICKS)
    const resumed = advanceTicks(loaded.state, BRACE_TICKS)
    expect(resumed.events).toEqual(original.events)
    expect(stateDigest(resumed.state)).toBe(stateDigest(original.state))
  })

  it('reads a section saved before foam as one with none, and refuses malformed foam', () => {
    expect(terrainToolsStateProblems({ beacon: null })).toEqual([])
    expect(terrainToolsStateProblems({ beacon: null, foam: [] })).toEqual([
      'terrain-tools.foam is malformed',
    ])
    expect(terrainToolsStateProblems({ beacon: null, foam: [{ tx: 1, ty: 2 }] })).toEqual([
      'terrain-tools.foam is malformed',
    ])
  })
})

/** The cells of `tiles` foam may set on, read as p1 sees the ground. */
function foamableOn(state: AuthorityState, tiles: readonly TilePoint[]): TilePoint[] {
  const view = openGroundView(state, 'p1', editSourceOf(STABILISER_FOAM_ID))
  if (view === null) throw new Error('no planet')
  return foamableCellsOf(view, tiles)
}

/** Every ore cell gated as `gateKind`, refused to every tool, as `canMine` refuses one. */
function gateProbeOf(gateKind: string): SliceDefinition {
  return {
    id: 'gate-probe',
    register: (r) =>
      r.gateCheck({
        id: `gate-probe.${gateKind}`,
        check: () => ({ outcome: 'refused', gateKind, required: gateKind, have: 'none' }),
      }),
  }
}

/** An ore cell a few tiles down with plain ground just left of it. */
function buriedOreTile(): TilePoint {
  for (let tx = 12; tx < 200; tx += 1) {
    for (let depth = 4; depth < 14; depth += 1) {
      const tile = { tx, ty: surfaceRowOfColumn(tx, PARAMS.radiusTiles) - depth }
      const left = { tx: tx - 1, ty: tile.ty }
      if (kindAt(tile) === CELL_KIND.ore && kindAt(left) === CELL_KIND.ground) return tile
    }
  }
  throw new Error('no buried ore with ground beside it')
}

function kindAt(tile: TilePoint): number {
  return kindOfCell(cellAt(EMPTY_WORLD, PARAMS, tile))
}

/** Steps the session to `endTick` in render frames at `rate` frames a second. */
function stepInFrames(session: ScriptedSession, rate: number, endTick: number): void {
  let clock = NEW_FIXED_STEP_CLOCK
  let tick = session.state().tick
  while (tick < endTick) {
    const frame = stepsForFrame(clock, 1 / rate, 1 / TICKS_PER_SECOND, 8)
    clock = frame.clock
    tick = Math.min(endTick, tick + frame.steps)
    session.advanceTo(tick)
  }
}
