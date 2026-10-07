import { describe, expect, it } from 'vitest'
import { MM_PER_METRE, VEHICLE_COLLIDER_SIZE } from '../../../constants/physics'
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import type { TerrainCellEdit } from '../../../systems/authority/terrain/terrainEdits'
import { FACING, type Facing, type VehiclePose } from '../../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { buriedTile, press, sessionWith, standAt } from '../terrainTestSession'
import type { EditKey } from './editSeed'
import { openGroundView, type GroundView } from './groundView'
import { LODESTONE_BEACON_ID, planLodestoneGather } from './lodestoneBeacon'
import { ORE_SHIFTER_ID, planOreDrag } from './oreShifter'
import { planPressurePocket, PRESSURE_POCKET_ID } from './pressurePocket'
import { planSeamSplit, SEAM_SPLITTER_ID } from './seamSplitter'
import { editSourceOf, type TerrainPlan } from './terrainOutcome'

// #162 acceptance 5 (G&V E3): a property test over seeds with 2 vehicles. No terrain edit changes
// a cell within 1 m of any vehicle, and none moves a vehicle. The second miner stands where the
// first's edits reach: in front of it, below it, or beside its pocket.

type Planner = (view: GroundView, key: EditKey, pose: VehiclePose) => TerrainPlan

const PLANNERS: readonly (readonly [string, Planner])[] = [
  [ORE_SHIFTER_ID, planOreDrag],
  [SEAM_SPLITTER_ID, planSeamSplit],
  [PRESSURE_POCKET_ID, planPressurePocket],
]

const SEEDS = [83921, 31415, 27182, 4242, 99991]
const DEPTHS = [7, 12, 19]
/** Mark 1, and the Marks P100 reaches: sizes at their caps. */
const MARKS = [1, 34]
/** Where the teammate stands, in tiles from the first miner. */
const TEAMMATE_OFFSETS: readonly TilePoint[] = [
  { tx: 3, ty: 0 },
  { tx: 4, ty: 1 },
  { tx: 2, ty: -2 },
  { tx: 6, ty: 0 },
]

const ANCHOR_REACH_MM = (VEHICLE_COLLIDER_SIZE * MM_PER_METRE) / 2 + MM_PER_METRE

interface TwoMiners {
  state: AuthorityState
  stand: TilePoint
}

function twoMinersAt(seed: number, depth: number, offset: TilePoint, facing: Facing): TwoMiners {
  const session = sessionWith({}, ['p1', 'p2'], seed)
  const stand = buriedTile(depth)
  standAt(session, 5, stand, facing, 'p1')
  standAt(session, 5, { tx: stand.tx + offset.tx, ty: stand.ty + offset.ty }, facing, 'p2')
  return { state: session.state(), stand }
}

/** The nearest point of the tile to the vehicle's centre, in mm, against the anchor reach. */
function isWithinAnchorOf(pose: VehiclePose, cell: TerrainCellEdit): boolean {
  const nearestX = Math.min(Math.max(pose.x, cell.tx * MM_PER_METRE), (cell.tx + 1) * MM_PER_METRE)
  const nearestY = Math.min(Math.max(pose.y, cell.ty * MM_PER_METRE), (cell.ty + 1) * MM_PER_METRE)
  const dx = nearestX - pose.x
  const dy = nearestY - pose.y
  return dx * dx + dy * dy < ANCHOR_REACH_MM * ANCHOR_REACH_MM
}

function posesOf(state: AuthorityState): VehiclePose[] {
  return ['p1', 'p2'].map((playerId) => vehicleOf(state, playerId).pose as VehiclePose)
}

function plannedCells(itemId: string, plan: Planner, miners: TwoMiners, mark: number) {
  const view = openGroundView(miners.state, 'p1', editSourceOf(itemId))
  if (view === null) throw new Error('no planet')
  const [pose] = posesOf(miners.state)
  const result = plan(view, { origin: miners.stand, tick: 10, itemId, mark }, pose)
  return result.kind === 'edit' ? result.cells : []
}

function gatherCells(miners: TwoMiners, mark: number) {
  const view = openGroundView(miners.state, 'p1', editSourceOf(LODESTONE_BEACON_ID))
  if (view === null) throw new Error('no planet')
  return planLodestoneGather(view, { ...miners.stand, planetIndex: 1, plantedTick: 10, mark })
}

const CASES = SEEDS.flatMap((seed) => DEPTHS.map((depth) => [seed, depth] as const))

describe('vehicle anchors', () => {
  it.each(CASES)(
    'seed %i, %i tiles down: no planned cell lies within 1 m of either miner',
    (seed, depth) => {
      let planned = 0
      for (const offset of TEAMMATE_OFFSETS) {
        for (const facing of [FACING.right, FACING.down]) {
          const miners = twoMinersAt(seed, depth, offset, facing)
          const poses = posesOf(miners.state)
          for (const mark of MARKS) {
            const cells = [
              ...PLANNERS.flatMap(([itemId, plan]) => plannedCells(itemId, plan, miners, mark)),
              ...gatherCells(miners, mark),
            ]
            planned += cells.length
            const anchored = cells.filter((cell) =>
              poses.some((pose) => isWithinAnchorOf(pose, cell)),
            )
            expect(anchored).toEqual([])
          }
        }
      }
      expect(planned).toBeGreaterThan(0)
    },
  )

  it.each(SEEDS)('seed %i: a use beside a teammate moves neither miner', (seed) => {
    for (const [itemId] of [...PLANNERS, [LODESTONE_BEACON_ID]] as const) {
      const session = sessionWith({ 'powerup.1': itemId }, ['p1', 'p2'], seed)
      const stand = buriedTile(12)
      standAt(session, 5, stand, FACING.right, 'p1')
      standAt(session, 5, { tx: stand.tx + 3, ty: stand.ty }, FACING.left, 'p2')
      const before = posesOf(session.state())
      session.submit(10, press())
      session.advanceTo(30)
      expect(posesOf(session.state())).toEqual(before)
    }
  })
})
