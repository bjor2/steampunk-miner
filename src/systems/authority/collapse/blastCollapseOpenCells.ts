/**
 * The cells a bare blast's collapse leaves open (D2 #861; the Horizontal Scaler on #861: "a collapse
 * refills cells and keeps their ore. It never damages the rig, never takes money, never seals it
 * in"). The shared refill (`collapseRefill.ts`) already keeps every sample within a body's clearance
 * open and every reinforced cell; a blast's collapse also keeps open
 *
 * - the cell holding each vehicle's body centre, so it never refills the rig's cell;
 * - every cell some vehicle on the planet could not drill now: one its tip cannot scratch, or one
 *   whose gate stands against its drill (`canMine`). A collapse never adds a blast-only cell.
 *
 * Every cell it does refill keeps its own material, so its ore and its hardness are what they were,
 * and every vehicle can drill it, so a rig in the pocket always has a way out.
 */
import { tileOfMillimetres } from '../../vehicle/vehiclePose'
import { statsOfVehicle } from '../../vehicle/vehicleState'
import type { CellReinforced } from '../../world/collapseRefill'
import type { PlanetParams } from '../../world/planetParams'
import type { TilePoint } from '../../world/tileGrid'
import { materialCellAt } from '../../world/worldState'
import { isStandingVerdict } from '../../registries/gateChecks'
import { vehicleOf, type AuthorityState } from '../authorityState'
import { gateOfTile } from '../cellGates'
import { ticksPerCell } from '../groundDrill'
import { reinforcedCellsOf } from './collapseReinforcement'
import type { CollapsingBlock } from './collapseState'
import { vehicleBodiesOf } from './collapseWatch'

/** The refill's view of the cells it must leave open: reinforced ones, and a blast's own. */
export function keptOpenCellsOf(
  state: AuthorityState,
  params: PlanetParams,
  entry: CollapsingBlock,
): CellReinforced {
  const reinforced = reinforcedCellsOf(state)
  if (entry.isBlast !== true) return reinforced
  const rigCells = new Set(rigCellsOf(state).map(keyOfTile))
  const isUndrillable = undrillableCellsOf(state, params)
  return (tx, ty) => reinforced(tx, ty) || rigCells.has(`${tx},${ty}`) || isUndrillable(tx, ty)
}

/** The cell holding each vehicle's body centre. */
function rigCellsOf(state: AuthorityState): TilePoint[] {
  return vehicleBodiesOf(state).map(({ centre }) => tileOfMillimetres(centre.xMm, centre.yMm))
}

/** Whether some vehicle on the planet could not drill the cell's material: asked once per cell. */
function undrillableCellsOf(state: AuthorityState, params: PlanetParams): CellReinforced {
  const playerIds = vehicleBodiesOf(state).map(({ playerId }) => playerId)
  const answers = new Map<string, boolean>()
  return (tx, ty) => {
    const key = `${tx},${ty}`
    const known = answers.get(key)
    if (known !== undefined) return known
    const tile = { tx, ty }
    const answer = playerIds.some((playerId) => !canDrillCell(state, params, playerId, tile))
    answers.set(key, answer)
    return answer
  }
}

/** The player's own drill scratches the cell's material and no gate stands against it. */
function canDrillCell(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  tile: TilePoint,
): boolean {
  const drill = statsOfVehicle(vehicleOf(state, playerId))
  const material = materialCellAt(state.world, params, tile)
  if (ticksPerCell(drill, params, tile, material) === null) return false
  const gated = gateOfTile({ state, playerId, params, blast: null }, tile)
  return gated === null || !isStandingVerdict(gated.verdict)
}

function keyOfTile({ tx, ty }: TilePoint): string {
  return `${tx},${ty}`
}
