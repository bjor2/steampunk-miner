/**
 * The phase lantern (#261, the GD locks on #245 and #255: aether, the phase verb): one phase per
 * slot tap. When the wind-up ends the vehicle sets out through the one cell ahead of its nose
 * (`aheadCells` 1) to land in the cell beyond, over exactly the ticks the bit would need to break
 * that cell with the current drill (`ticksPerCell`, heat throttle and shock included). The cell
 * stays as it is: nothing is breached, no ore is gained and no lava wakes. It adds a verb, never
 * yield.
 *
 * It costs the bit's energy for those ticks plus the lantern's own, and heat onto the item gauge
 * (the lock: energy and heat, no new resource). A phase is refused on any cell the drill could
 * not take, so it never skips a gated cell or beats the descent curve: a cell already open, the
 * dock pad or lava, a gate verdict that is not `cut` (#142's `canMine`, asked as the tool
 * `aetheric.phase_lantern`), a cell the tip cannot scratch, or the core. The landing cell must be
 * open air or tunnel with no enemy standing in it, checked here at the act (G&V on #261); a
 * phase already under way refuses another. A refused press spends no charge, energy or heat.
 *
 * The move itself is `phaseMoves.ts`: the motion the kernel steers, the clock that lands or
 * reverses it, and the hold the slot's ring shows.
 */
import {
  vehicleOf,
  withVehicle,
  type AuthorityState,
} from '../../../systems/authority/authorityState'
import { gateOfTile } from '../../../systems/authority/cellGates'
import { ticksPerCell } from '../../../systems/authority/groundDrill'
import { heatThrottledDrill } from '../../../systems/authority/heatRules'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import { ENERGY_QUANTA_PER_TICK } from '../../../systems/vehicle/energyQuanta'
import { tileOfMillimetres } from '../../../systems/vehicle/vehiclePose'
import type { VehicleState } from '../../../systems/vehicle/vehicleState'
import type { PlanetParams } from '../../../systems/world/planetParams'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { CELL_KIND, isAirCell, isRemovableCell, kindOfCell } from '../../../systems/world/worldCell'
import { cellAt, materialCellAt } from '../../../systems/world/worldState'
import type { PowerUp, PowerUpOutcome, PowerUpUse } from '../../power-up-core'
import {
  CELL_DENSE,
  CELL_GATED,
  CELL_LOCKED,
  CORE_CELL,
  ENERGY_SHORT,
  NO_LANDING,
  NOTHING_AHEAD,
  PHASING,
  phaseStartedOf,
} from './aethericEvents'
import { withItemHeatAdded } from './itemHeat'
import { LANTERN_ICON_ID, LANTERN_ID, LANTERN_NAME, lanternBalance } from './lanternItem'
import { phaseCellsOf, type PhaseCells } from './phaseCells'
import { phaseOf, withPhase, type PhaseMove } from './phaseSection'

/**
 * The lantern as `power-up-core` runs it (#162 2.1, 4.2): a charged item whose charges refill at
 * the dock, with the Mark 1 numbers that power-up-core steps with the ladder. The hold it shows on
 * the slot's ring is the move (`phaseMoves.ts`).
 */
export function lanternPowerUp(holdOf: PowerUp['holdOf']): PowerUp {
  const balance = lanternBalance()
  return {
    id: 'aetheric.phase_lantern',
    itemId: LANTERN_ID,
    iconId: LANTERN_ICON_ID,
    name: LANTERN_NAME,
    powerUpClass: 'charged',
    charges: balance.charges,
    cooldownTicks: balance.cooldownTicks,
    windupTicks: balance.windupTicks,
    channelTicks: 0,
    isToggle: false,
    energyDrawBpPerSecond: 0,
    activate: phaseThroughCell,
    holdOf,
  }
}

/** A phase the act has judged: its cells, its ticks and what it costs. */
interface JudgedPhase {
  cells: PhaseCells
  ticks: number
  energy: number
}

/** The act: judge the cell ahead and the landing, pay, and set the move going. */
export function phaseThroughCell(state: AuthorityState, use: PowerUpUse): PowerUpOutcome {
  const judged = judgePhase(state, use)
  if (typeof judged === 'string') return { kind: 'refused', reason: judged }
  const move = moveOf(use, judged)
  const paid = withPhasePaid(state, use, judged.energy)
  return {
    kind: 'acted',
    effect: {
      state: withPhase(paid, use.playerId, { phase: move }),
      events: [phaseStartedOfUse(use, move, judged.energy, lanternBalance().heatUnits)],
    },
  }
}

/** The phase as it would go, or the reason it cannot. */
function judgePhase(state: AuthorityState, use: PowerUpUse): JudgedPhase | string {
  const params = planetParamsOf(state.planet)
  const vehicle = vehicleOf(state, use.playerId)
  if (params === null || vehicle.pose === null) return NOTHING_AHEAD
  if (phaseOf(state, use.playerId).phase !== null) return PHASING
  const cells = phaseCellsOf(vehicle.pose)
  const cellRefusal = refusalOfCell(state, params, use.playerId, cells.cell)
  if (cellRefusal !== null) return cellRefusal
  const ticks = bitTicksOf(state, params, vehicle, cells.cell)
  if (ticks === null) return CELL_DENSE
  if (!isLandingOpen(state, params, cells.landing)) return NO_LANDING
  return judgedPhaseOf(vehicle, cells, ticks)
}

/** Why the cell ahead cannot be phased through; null when the drill could take it. */
function refusalOfCell(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  cell: TilePoint,
): string | null {
  const material = materialCellAt(state.world, params, cell)
  if (isAirCell(cellAt(state.world, params, cell))) return NOTHING_AHEAD
  if (kindOfCell(material) === CELL_KIND.core) return CORE_CELL
  if (!isRemovableCell(material)) return CELL_LOCKED
  if (!isCutByGates(state, params, playerId, cell)) return CELL_GATED
  return null
}

/** #142's `canMine` for the lantern: no gate on the cell, or one whose verdict is `cut`. */
function isCutByGates(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  cell: TilePoint,
): boolean {
  const gated = gateOfTile({ state, playerId, params, blast: null, tool: LANTERN_ID }, cell)
  return gated === null || gated.verdict.outcome === 'cut'
}

/** The energy the bit's ticks and the lantern cost, from a tank that can pay it; else short. */
function judgedPhaseOf(
  vehicle: VehicleState,
  cells: PhaseCells,
  ticks: number,
): JudgedPhase | string {
  const energy = ticks * ENERGY_QUANTA_PER_TICK.drill + lanternBalance().energyQuanta
  if (vehicle.energy < energy) return ENERGY_SHORT
  return { cells, ticks, energy }
}

/** The whole ticks the current drill would take on the cell, or null when it cannot scratch it. */
function bitTicksOf(
  state: AuthorityState,
  params: PlanetParams,
  vehicle: VehicleState,
  cell: TilePoint,
): number | null {
  const drill = heatThrottledDrill(params.planetIndex, vehicle)
  return ticksPerCell(drill, params, cell, materialCellAt(state.world, params, cell))
}

/** Open air or tunnel with no enemy standing in it: where a phase may land (G&V on #261). */
export function isLandingOpen(
  state: AuthorityState,
  params: PlanetParams,
  landing: TilePoint,
): boolean {
  if (!isAirCell(cellAt(state.world, params, landing))) return false
  return !state.combat.enemies.some((enemy) => isEnemyIn(enemy, landing))
}

function isEnemyIn(enemy: { x: number; y: number }, tile: TilePoint): boolean {
  const stands = tileOfMillimetres(enemy.x, enemy.y)
  return stands.tx === tile.tx && stands.ty === tile.ty
}

function moveOf(use: PowerUpUse, { cells, ticks }: JudgedPhase): PhaseMove {
  return {
    fromTx: use.origin.tx,
    fromTy: use.origin.ty,
    cellTx: cells.cell.tx,
    cellTy: cells.cell.ty,
    toTx: cells.landing.tx,
    toTy: cells.landing.ty,
    startTick: use.tick,
    endTick: use.tick + ticks,
    isReturning: false,
  }
}

function withPhasePaid(state: AuthorityState, use: PowerUpUse, energy: number): AuthorityState {
  const vehicle = vehicleOf(state, use.playerId)
  const paid = withVehicle(state, use.playerId, { ...vehicle, energy: vehicle.energy - energy })
  return withItemHeatAdded(paid, use.playerId, use.tick, lanternBalance().heatUnits)
}

function phaseStartedOfUse(use: PowerUpUse, move: PhaseMove, energy: number, heat: number) {
  return phaseStartedOf({
    playerId: use.playerId,
    itemId: use.itemId,
    cellTx: move.cellTx,
    cellTy: move.cellTy,
    toTx: move.toTx,
    toTy: move.toTy,
    ticks: move.endTick - move.startTick,
    energy,
    heat,
  })
}
