import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { PARAMS } from '../../../systems/authority/scriptedSession'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { surfaceRowOfColumn, type TilePoint } from '../../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../../systems/world/worldCell'
import { cellAt, EMPTY_WORLD } from '../../../systems/world/worldState'
import { slice as TERRAIN_TOOLS_SLICE } from '../register'
import { sessionWith, standAt } from '../terrainTestSession'
import { openGroundView } from './groundView'
import { LODESTONE_BEACON_ID, planLodestoneGather } from './lodestoneBeacon'
import { ORE_SHIFTER_ID } from './oreShifter'
import { PRESSURE_POCKET_ID } from './pressurePocket'
import { REPULSOR_COIL_ID } from './repulsorCoil'
import { SEAM_SPLITTER_ID } from './seamSplitter'
import { TERRAIN_POWER_UPS } from './terrainPowerUps'
import { editSourceOf } from './terrainOutcome'

// #162 acceptance 3 for the terrain lane, as the GD lock on #204 Q5 reads it (the split on #202
// follows #204's and #205's guards): every tool used against a rig-gated, a dynamite-gated and a
// core cell leaves that cell, and every other, as it was. A tool whose act would change the cell
// is blocked by it, which `power-up-core` logs as `power_up_blocked_by_gate` and answers by giving
// the charge back; planting a lodestone changes no cell, and its gather leaves gated cells alone.
//
// The probe gates every ore cell of planet 1 (#142's `canMine` gates nothing before planet 7), so
// the shifter has only gated nodules in reach. The splitter's face and the pocket lance's centre
// are the target cell itself; the repulsor coil's wave reaches it two tiles out.

const TARGET_ORE = buriedOreTile()
const TARGET_CORE: TilePoint = { tx: 0, ty: 0 }

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

const TARGETS: readonly (readonly [string, TilePoint, string])[] = [
  ['rig-gated', TARGET_ORE, 'rig'],
  ['dynamite-gated', TARGET_ORE, 'dynamite'],
  ['core', TARGET_CORE, 'core'],
]

/** How far left of the target each tool's miner stands, facing it. */
const STAND_OFFSET: Readonly<Record<string, number>> = {
  [ORE_SHIFTER_ID]: 2,
  [SEAM_SPLITTER_ID]: 2,
  [PRESSURE_POCKET_ID]: 3,
  [LODESTONE_BEACON_ID]: 2,
  [REPULSOR_COIL_ID]: 2,
}

const BLOCKED_TOOLS = [ORE_SHIFTER_ID, SEAM_SPLITTER_ID, PRESSURE_POCKET_ID]

const CASES = TERRAIN_POWER_UPS.flatMap((powerUp) =>
  TARGETS.map(([kind, tile, gateKind]) => [powerUp.itemId, kind, tile, gateKind] as const),
)

describe('terrain-tools gates fixture', () => {
  it('aims at an ore cell and a core cell, with ground or core where each miner stands', () => {
    expect(kindOfCell(cellAt(EMPTY_WORLD, PARAMS, TARGET_ORE))).toBe(CELL_KIND.ore)
    expect(kindOfCell(cellAt(EMPTY_WORLD, PARAMS, TARGET_CORE))).toBe(CELL_KIND.core)
    const coreStand = { tx: TARGET_CORE.tx - 3, ty: TARGET_CORE.ty }
    expect(kindOfCell(cellAt(EMPTY_WORLD, PARAMS, coreStand))).toBe(CELL_KIND.core)
  })

  it.each(CASES)('%s against a %s cell changes no cell', (itemId, _kind, tile, gateKind) => {
    withRegistrations([TERRAIN_TOOLS_SLICE, gateProbeOf(gateKind)], () => {
      const state = minerFacing(tile, STAND_OFFSET[itemId])
      const outcome = activate(itemId, state, tile)
      if (outcome.kind === 'acted') {
        expect(outcome.effect.state.world).toBe(state.world)
        expect(outcome.effect.state.terrainEdits).toEqual(state.terrainEdits)
      }
      expect(outcome.kind === 'blocked').toBe(BLOCKED_TOOLS.includes(itemId))
    })
  })

  it.each(TARGETS)(
    'blocks the splitter and the lance at the %s cell itself',
    (_kind, tile, gateKind) => {
      withRegistrations([TERRAIN_TOOLS_SLICE, gateProbeOf(gateKind)], () => {
        for (const itemId of [SEAM_SPLITTER_ID, PRESSURE_POCKET_ID]) {
          const outcome = activate(itemId, minerFacing(tile, STAND_OFFSET[itemId]), tile)
          expect(outcome).toMatchObject({ kind: 'blocked', block: { ...tile, gateKind } })
        }
      })
    },
  )

  it.each(TARGETS)(
    'names the %s gate when only fixed cells are in the shifter’s reach',
    (_kind, tile, gateKind) => {
      withRegistrations([TERRAIN_TOOLS_SLICE, gateProbeOf(gateKind)], () => {
        const outcome = activate(ORE_SHIFTER_ID, minerFacing(tile, 2), tile)
        expect(outcome).toMatchObject({ kind: 'blocked', block: { gateKind } })
      })
    },
  )

  it.each(TARGETS)('gathers no %s cell into a lodestone vein', (_kind, tile, gateKind) => {
    withRegistrations([TERRAIN_TOOLS_SLICE, gateProbeOf(gateKind)], () => {
      const state = minerFacing(tile, 2)
      const view = openGroundView(state, 'p1', editSourceOf(LODESTONE_BEACON_ID))
      if (view === null) throw new Error('no planet')
      const beacon = { tx: tile.tx - 2, ty: tile.ty, planetIndex: 1, plantedTick: 10, mark: 1 }
      expect(planLodestoneGather(view, beacon)).toEqual([])
    })
  })
})

/** The miner at rest `offset` tiles left of the target, facing it, every terrain tool slotted. */
function minerFacing(target: TilePoint, offset: number): AuthorityState {
  const session = sessionWith({})
  standAt(session, 5, { tx: target.tx - offset, ty: target.ty }, FACING.right)
  return session.state()
}

function activate(itemId: string, state: AuthorityState, tile: TilePoint) {
  const powerUp = TERRAIN_POWER_UPS.find((candidate) => candidate.itemId === itemId)
  if (powerUp === undefined) throw new Error(`${itemId} is not shipped`)
  const origin = { tx: tile.tx - STAND_OFFSET[itemId], ty: tile.ty }
  return powerUp.activate(state, {
    playerId: 'p1',
    itemId,
    slot: 'powerup.1',
    tick: 20,
    origin,
    mark: 0,
    magnitude: null,
  })
}

/** An ore cell a few tiles down with plain ground on the three tiles to its left. */
function buriedOreTile(): TilePoint {
  for (let tx = 12; tx < 200; tx += 1) {
    for (let depth = 4; depth < 14; depth += 1) {
      const tile = { tx, ty: surfaceRowOfColumn(tx, PARAMS.radiusTiles) - depth }
      if (isOre(tile) && [1, 2, 3].every((left) => isGround({ tx: tx - left, ty: tile.ty })))
        return tile
    }
  }
  throw new Error('no buried ore with ground beside it')
}

function isOre(tile: TilePoint): boolean {
  return kindOfCell(cellAt(EMPTY_WORLD, PARAMS, tile)) === CELL_KIND.ore
}

function isGround(tile: TilePoint): boolean {
  return kindOfCell(cellAt(EMPTY_WORLD, PARAMS, tile)) === CELL_KIND.ground
}
