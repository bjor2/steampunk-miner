import { describe, expect, it } from 'vitest'
import {
  DENSITY_CELL_UNITS,
  SWAP_CELL_UNITS,
  TERRAIN_EDIT_UNITS_PER_TICK,
} from '../../../constants/terrainBudget'
import { vehicleOf } from '../../../systems/authority/authorityState'
import type { TerrainCellEdit } from '../../../systems/authority/terrain/terrainEdits'
import { FACING, type Facing, type VehiclePose } from '../../../systems/vehicle/vehiclePose'
import { buriedTile, sessionWith, standAt } from '../terrainTestSession'
import type { EditKey } from './editSeed'
import { openGroundView, type GroundView } from './groundView'
import { LODESTONE_BEACON_ID, planLodestoneGather } from './lodestoneBeacon'
import { ORE_SHIFTER_ID, planOreDrag } from './oreShifter'
import { planPressurePocket, PRESSURE_POCKET_ID } from './pressurePocket'
import { planSeamSplit, SEAM_SPLITTER_ID } from './seamSplitter'
import { SHIPPED_TERRAIN_ITEMS } from './shippedTools'
import { editSourceOf, type TerrainPlan } from './terrainOutcome'
import { terrainItemOf } from './terrainItems'

// The TD's caps (#162 section 3 and the endless Mark cap): each activation edits at most 32
// density cells or 64 swaps in total, whatever the Mark, and a lodestone beacon at most 256 swaps.
// Mark-ladder cases at the Marks reachable on P60 and P100 (`markTier = unlockTier + 3(N-1)`, #161),
// for every terrain tool, at many places on the planet.

type Planner = (view: GroundView, key: EditKey, pose: VehiclePose) => TerrainPlan

const PLANNERS: Readonly<Record<string, Planner>> = {
  [ORE_SHIFTER_ID]: planOreDrag,
  [SEAM_SPLITTER_ID]: planSeamSplit,
  [PRESSURE_POCKET_ID]: planPressurePocket,
}

const DEPTHS = [6, 9, 13, 18, 24, 31]
const PLANETS = [1, 60, 100]

/** The Mark a player can hold of the item on planet `planet`. */
function markOnPlanet(itemId: string, planet: number): number {
  const unlock = terrainItemOf(itemId)?.node.unlockTier ?? 1
  return planet < unlock ? 1 : Math.floor((planet - unlock) / 3) + 1
}

function unitsOf(cells: readonly TerrainCellEdit[]): number {
  return cells.reduce(
    (sum, cell) => sum + (cell.kind === 'density' ? DENSITY_CELL_UNITS : SWAP_CELL_UNITS),
    0,
  )
}

function standingView(itemId: string, depth: number, facing: Facing = FACING.right) {
  const session = sessionWith({})
  const stand = buriedTile(depth)
  standAt(session, 5, stand, facing)
  const state = session.state()
  const view = openGroundView(state, 'p1', editSourceOf(itemId))
  const pose = vehicleOf(state, 'p1').pose
  if (view === null || pose === null) throw new Error('no ground to stand on')
  return { view, pose, stand }
}

const ACTIVATION_CASES = Object.keys(PLANNERS).flatMap((itemId) =>
  PLANETS.map((planet) => [itemId, planet, markOnPlanet(itemId, planet)] as const),
)

describe('terrain edit caps', () => {
  it.each(ACTIVATION_CASES)(
    '%s on P%i (Mark %i) edits at most 32 density cells or 64 swaps per activation',
    (itemId, _planet, mark) => {
      for (const depth of DEPTHS) {
        for (const facing of [FACING.right, FACING.left, FACING.down]) {
          const { view, pose, stand } = standingView(itemId, depth, facing)
          const plan = PLANNERS[itemId](view, { origin: stand, tick: 10, itemId, mark }, pose)
          if (plan.kind !== 'edit') continue
          expect(unitsOf(plan.cells)).toBeLessThanOrEqual(TERRAIN_EDIT_UNITS_PER_TICK)
        }
      }
    },
  )

  it.each(PLANETS.map((planet) => [planet, markOnPlanet(LODESTONE_BEACON_ID, planet)]))(
    'a lodestone beacon on P%i (Mark %i) swaps at most 256 cells',
    (_planet, mark) => {
      for (const depth of DEPTHS) {
        const { view, stand } = standingView(LODESTONE_BEACON_ID, depth)
        const beacon = { ...stand, planetIndex: 1, plantedTick: 10, mark }
        const cells = planLodestoneGather(view, beacon)
        expect(cells.every((cell) => cell.kind === 'swap')).toBe(true)
        expect(cells.length).toBeLessThanOrEqual(256)
      }
    },
  )

  it('covers every shipped terrain tool', () => {
    const covered = [...Object.keys(PLANNERS), LODESTONE_BEACON_ID].sort()
    expect(covered).toEqual(SHIPPED_TERRAIN_ITEMS.map((item) => item.itemId).sort())
  })
})
