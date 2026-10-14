import { describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../../../constants/pacingSeeds'
import { DENSITY_CELL_UNITS, SWAP_CELL_UNITS } from '../../../constants/terrainBudget'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { GROUND } from '../../../systems/authority/scriptedSession'
import type { TerrainCellEdit } from '../../../systems/authority/terrain/terrainEdits'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { planetParamsFor } from '../../../systems/world/planetParams'
import { surfaceRowOfColumn, type TilePoint } from '../../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../../systems/world/worldCell'
import type { FollowUpPattern, PowerUpUse } from '../../power-up-core'
import { lastMarkOf } from '../../tech-tree'
import { sessionWith, standAt } from '../terrainTestSession'
import { ACTIVATION_UNIT_CAP } from './editDraft'
import { terrainItemNamed } from './itemMagnitude'
import { gatherAtDock, LODESTONE_BEACON_ID } from './lodestoneBeacon'
import {
  beaconAtFullStack,
  pocketAtFullStack,
  shifterAtFullStack,
  type MoverAtFullStack,
} from './moverIncomeRates'
import { ORE_SHIFTER_ID } from './oreShifter'
import { PRESSURE_POCKET_ID } from './pressurePocket'
import { SEAM_SPLITTER_ID } from './seamSplitter'
import { balanceOf, markLadderOf } from './terrainItems'
import { TERRAIN_POWER_UPS } from './terrainPowerUps'

// Mark milestones never yield (GD lock on #256, the non-yield checks of ticket 278): every terrain
// tool is an income item, so its second tap and its hold change only where or how it works, never
// the ore or the cells of a use. On the three pacing seeds' planet 1, each tool at its last Mark
// acts plain, as a second tap and as a hold from the same state, from a pocket at five depths
// facing right. Where the ground lies differs with the verb, so the ore it finds does too; no use,
// whatever its verb, moves more ore than the income cap counts a plain use to move
// (`moverIncomeRates.ts`), or spends more of the K6 queue than one activation may (the TD cap; a
// beacon's gather its swap cap). The lodestone beacon's use is its gather at the next dock.

const SEEDS: readonly number[] = PACING_WORLD_SEEDS['bot-slice']
const DEPTHS = [6, 8, 10, 14, 20]
const VERBS: readonly (FollowUpPattern | null)[] = [null, 'second-tap', 'hold']
const ACT_TICK = 11
const NO_ORE_MOVED: MoverAtFullStack = { oreCellsPerUse: 0, usesPerMinute: 0 }

/** What one use of a tool may move at most, whatever its verb. */
interface UseBudget {
  itemId: string
  oreCells: number
  units: number
  /** The use's edit, queued: the beacon's lands at the next dock. */
  queuedBy: (state: AuthorityState) => AuthorityState
}

/** What one use queued: the ore cells it moved and the K6 units its edit costs. */
interface UseMeasure {
  seed: number
  verb: FollowUpPattern | null
  oreCells: number
  units: number
}

const AS_QUEUED = (state: AuthorityState) => state
const GATHERED_AT_DOCK = (state: AuthorityState) => gatherAtDock(state, 'p1').state

const BUDGETS: readonly UseBudget[] = [
  budgetOf(ORE_SHIFTER_ID, shifterAtFullStack(), ACTIVATION_UNIT_CAP, AS_QUEUED),
  budgetOf(SEAM_SPLITTER_ID, NO_ORE_MOVED, ACTIVATION_UNIT_CAP, AS_QUEUED),
  budgetOf(PRESSURE_POCKET_ID, pocketAtFullStack(), ACTIVATION_UNIT_CAP, AS_QUEUED),
  budgetOf(LODESTONE_BEACON_ID, beaconAtFullStack(), beaconSwapCap(), GATHERED_AT_DOCK),
]

function budgetOf(
  itemId: string,
  mover: MoverAtFullStack,
  units: number,
  queuedBy: UseBudget['queuedBy'],
): UseBudget {
  return { itemId, oreCells: mover.oreCellsPerUse, units, queuedBy }
}

function beaconSwapCap(): number {
  return balanceOf(terrainItemNamed(LODESTONE_BEACON_ID)).swapCap ?? 0
}

function lastMarkOfTool(itemId: string): number {
  return lastMarkOf(markLadderOf(terrainItemNamed(itemId)))
}

/** The tile `depth` below the surface of the seed's planet 1, in the specs' column. */
function standOf(seed: number, depth: number): TilePoint {
  const { radiusTiles } = planetParamsFor(seed, 1)
  return { tx: GROUND.tx, ty: surfaceRowOfColumn(GROUND.tx, radiusTiles) - depth }
}

/** The miner at rest in a pocket at `stand`, the tool slotted, just before it acts. */
function stateBeforeUse(seed: number, itemId: string, stand: TilePoint): AuthorityState {
  const session = sessionWith({ 'powerup.1': itemId }, ['p1'], seed)
  standAt(session, 5, stand, FACING.right)
  session.advanceTo(ACT_TICK - 1)
  return session.state()
}

/** The tool used once as `verb` at its last Mark; null when it found nothing to act on. */
function measureUse(
  budget: UseBudget,
  seed: number,
  stand: TilePoint,
  verb: FollowUpPattern | null,
): UseMeasure | null {
  const powerUp = TERRAIN_POWER_UPS.find((each) => each.itemId === budget.itemId)
  if (powerUp === undefined) throw new Error(`${budget.itemId} is not a shipped terrain tool`)
  const outcome = powerUp.activate(
    stateBeforeUse(seed, budget.itemId, stand),
    powerUpUseOf(budget, stand, verb),
  )
  if (outcome.kind !== 'acted') return null
  const cells = budget.queuedBy(outcome.effect.state).terrainEdits.flatMap((edit) => edit.cells)
  return { seed, verb, oreCells: cells.filter(isOreLanding).length, units: unitsOf(cells) }
}

function powerUpUseOf(
  budget: UseBudget,
  stand: TilePoint,
  verb: FollowUpPattern | null,
): PowerUpUse {
  return {
    playerId: 'p1',
    itemId: budget.itemId,
    slot: 'powerup.1',
    tick: ACT_TICK,
    origin: stand,
    mark: lastMarkOfTool(budget.itemId),
    magnitude: null,
    ...(verb !== null && { milestone: verb }),
  }
}

/** A swap that lands ore on its tile: one per ore cell moved. */
function isOreLanding(cell: TerrainCellEdit): boolean {
  return cell.kind === 'swap' && kindOfCell(cell.cell) === CELL_KIND.ore
}

function unitsOf(cells: readonly TerrainCellEdit[]): number {
  return cells.reduce(
    (units, cell) => units + (cell.kind === 'density' ? DENSITY_CELL_UNITS : SWAP_CELL_UNITS),
    0,
  )
}

/** Every use of the tool on every seed, depth and verb that acted. */
function measuresOf(budget: UseBudget): UseMeasure[] {
  return SEEDS.flatMap((seed) =>
    DEPTHS.flatMap((depth) =>
      VERBS.flatMap((verb) => measureUse(budget, seed, standOf(seed, depth), verb) ?? []),
    ),
  )
}

/** Each seed and verb with no use that acted: a check that never ran there. */
function unmeasuredOf(measures: readonly UseMeasure[]): string[] {
  return SEEDS.flatMap((seed) =>
    VERBS.filter((verb) => !measures.some((m) => m.seed === seed && m.verb === verb)).map(
      (verb) => `${seed} ${verb ?? 'plain'}`,
    ),
  )
}

describe('terrain-tools Mark milestones never yield (#256, ticket 278)', () => {
  it.each(BUDGETS.map((budget) => [budget.itemId, budget] as const))(
    '%s: a second tap and a hold move no more ore and edit no more cells in a use than a plain use may, on the three pacing seeds',
    (_itemId, budget) => {
      const measures = measuresOf(budget)
      expect(unmeasuredOf(measures)).toEqual([])
      expect(Math.max(...measures.map((m) => m.oreCells))).toBeLessThanOrEqual(budget.oreCells)
      expect(Math.max(...measures.map((m) => m.units))).toBeLessThanOrEqual(budget.units)
    },
  )
})
