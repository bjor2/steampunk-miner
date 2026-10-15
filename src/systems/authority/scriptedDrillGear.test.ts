import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import type { DrillGearAsk } from '../economy/drillGearCaps'
import type { GateOutcome } from '../registries/gateChecks'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import { FACING, type Facing } from '../vehicle/vehiclePose'
import { cellDensitySum } from '../world/cellYield'
import { SOLID_DENSITY } from '../world/sampleGrid'
import type { TilePoint } from '../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../world/worldCell'
import { EMPTY_WORLD, materialCellAt, type WorldState } from '../world/worldState'
import { ticksPerCell } from './groundDrill'
import { heatThrottledDrill } from './heatRules'
import { createScriptedSession, drill, PARAMS, poseAbove, surfaceOreTiles } from './scriptedSession'
import { stateDigest } from './stateDigest'

// Scripted mining with the player's drill gear (GD ruling on #392, ticket 392): `drillTile`, the
// pacing bot's bore, reads the same gear as the reported drill, so the bot cuts what a player with
// that gear would. Fake slices register through withRegistrations, so no real slice is imported.

/** Band-1 ground six rows under the surface east of the dock, with ground below and beside it. */
const TARGET: TilePoint = { tx: 30, ty: 285 }
const BELOW: TilePoint = { tx: TARGET.tx, ty: TARGET.ty - 1 }
const LEFT: TilePoint = { tx: TARGET.tx - 1, ty: TARGET.ty }
const RIGHT: TilePoint = { tx: TARGET.tx + 1, ty: TARGET.ty }

/** A cell's 16 samples at full density. */
const INTACT = 16 * SOLID_DENSITY

function gearSlice(ask: DrillGearAsk | null): SliceDefinition {
  return {
    id: 'gear-probe',
    register: (r) => r.drillGear({ id: 'gear-probe.gear', gearOf: () => ask }),
  }
}

/** A gate on one tile only, the way #142's dynamite shell refuses the drill. */
function shellSlice(shell: TilePoint, outcome: GateOutcome): SliceDefinition {
  return {
    id: 'shell-probe',
    register: (r) =>
      r.gateCheck({
        id: 'shell-probe.one-tile',
        check: ({ tile }) =>
          tile.tx === shell.tx && tile.ty === shell.ty
            ? { outcome, gateKind: 'dynamite', required: '1', have: '0' }
            : null,
      }),
  }
}

/** What the bot bores and which way it faces it. */
interface Bore {
  target: TilePoint
  facing: Facing
}

const DOWN_INTO_TARGET: Bore = { target: TARGET, facing: FACING.down }

/** Where the bot stands to bore: the tile it came from. */
function standingTileOf({ target, facing }: Bore): TilePoint {
  if (facing === FACING.right) return { tx: target.tx - 1, ty: target.ty }
  return { tx: target.tx, ty: target.ty + 1 }
}

/** The ticks the planet-1 level-0 drill takes to break the target cell. */
function targetTicksOf(target: TilePoint): number {
  const session = createScriptedSession()
  const cell = materialCellAt(EMPTY_WORLD, PARAMS, target)
  return ticksPerCell(heatThrottledDrill(1, session.vehicle()), PARAMS, target, cell) as number
}

/** The bot's bore: a report facing the target, then one `drillTile` for its drill time. */
function boreWith(slices: readonly SliceDefinition[], bore: Bore = DOWN_INTO_TARGET) {
  return withRegistrations(slices, () => {
    const ticks = targetTicksOf(bore.target)
    const session = createScriptedSession()
    const standing = standingTileOf(bore)
    session.submit(1, poseAbove({ tx: standing.tx, ty: standing.ty - 1 }, bore.facing))
    const before = session.vehicle().energy
    const events = session.submit(1 + ticks, drill(bore.target, ticks))
    return {
      ticks,
      events,
      world: session.state().world,
      spent: before - session.vehicle().energy,
      digest: stateDigest(session.state()),
    }
  })
}

const kindAt = (tile: TilePoint) => kindOfCell(materialCellAt(EMPTY_WORLD, PARAMS, tile))

/** The first band-1 ground tile with an ore tile under it: a shell the bot would bore down onto. */
function groundOverOre(): Bore {
  for (const ore of surfaceOreTiles(40)) {
    const above = { tx: ore.tx, ty: ore.ty + 1 }
    if (kindAt(above) === CELL_KIND.ground) return { target: above, facing: FACING.down }
  }
  throw new Error('no ground over ore near the planet-1 surface')
}

const densityOf = (world: WorldState, tile: TilePoint) => cellDensitySum(world, PARAMS, tile)

describe('scripted mining with drill gear (ticket 392)', () => {
  it('stands the bore in plain band-1 ground with ground below and beside it', () => {
    const kinds = [TARGET, BELOW, LEFT, RIGHT].map(kindAt)
    expect(kinds.every((kind) => kind === CELL_KIND.ground)).toBe(true)
  })

  it('carves only the bored cell, byte for byte as before, when the gear adds no cell', () => {
    const bare = boreWith([])
    const silent = boreWith([gearSlice(null)])
    expect(silent.digest).toBe(bare.digest)
    expect(silent.events).toEqual(bare.events)
    expect([BELOW, LEFT, RIGHT].map((tile) => densityOf(bare.world, tile))).toEqual([
      INTACT,
      INTACT,
      INTACT,
    ])
  })

  it('opens the tile past the bored one along the facing in the same ticks, at its own cost', () => {
    const bare = boreWith([])
    const ahead = boreWith([gearSlice({ aheadCells: 1 })])
    expect(densityOf(bare.world, TARGET)).toBe(0)
    expect(densityOf(ahead.world, TARGET)).toBe(0)
    expect(densityOf(ahead.world, BELOW)).toBe(0)
    const destroyed = ahead.events.filter((event) => event.type === 'TileDestroyed')
    expect(destroyed).toHaveLength(2)
    expect(ahead.spent).toBe(bare.spent + ahead.ticks * ENERGY_QUANTA_PER_TICK.drill)
  })

  it('takes the ahead tile along a level facing, never the one below', () => {
    const ahead = boreWith([gearSlice({ aheadCells: 1 })], { target: TARGET, facing: FACING.right })
    expect(densityOf(ahead.world, RIGHT)).toBe(0)
    expect(densityOf(ahead.world, BELOW)).toBe(INTACT)
  })

  it('cuts the tiles on both sides of the bored cell for a side ask', () => {
    const wide = boreWith([gearSlice({ sideCells: 1, sideEnergyShareBp: 10_000 })])
    expect([LEFT, RIGHT].map((tile) => densityOf(wide.world, tile))).toEqual([0, 0])
    expect(densityOf(wide.world, BELOW)).toBe(INTACT)
  })

  it('leaves a gated tile past the bored one standing', () => {
    const bore = groundOverOre()
    const shell = { tx: bore.target.tx, ty: bore.target.ty - 1 }
    const gated = boreWith([gearSlice({ aheadCells: 1 }), shellSlice(shell, 'refused')], bore)
    const open = boreWith([gearSlice({ aheadCells: 1 })], bore)
    expect(densityOf(gated.world, bore.target)).toBe(0)
    expect(densityOf(gated.world, shell)).toBe(INTACT)
    expect(densityOf(open.world, shell)).toBeLessThan(INTACT)
  })

  it('bores straight down as the bare drill with a drive-aimed ahead ask, as the twin bit', () => {
    const bare = boreWith([])
    const twin = boreWith([gearSlice({ aheadCells: 1, aheadAim: 'drive' })])
    expect(twin.events).toEqual(bare.events)
    expect(twin.spent).toBe(bare.spent)
  })
})
