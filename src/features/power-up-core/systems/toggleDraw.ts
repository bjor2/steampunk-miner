/**
 * Toggles that draw energy (#162 section 4.4, the GD lock on #204 Q3 a, ticket 233): every tick
 * an active vehicle has a drawing toggle switched on in a slot, the tank loses the toggles' share
 * of `energyMax` a second in basis points (ticket 295, the TD lock on #205's draw unit). A tick
 * takes the whole quanta owed and carries the fraction to the next, so the summed draw over any
 * span is the rate times the span, never rounded up and never lost. The tank
 * then follows the kernel's energy rules, the same as after thrust: the low-energy lines, and a
 * strand at zero outside the pad, with no special case. At zero every drawing toggle switches
 * off, logged as the `PowerUpUsed {toggledOn: false}` a switch-off press logs.
 *
 * A toggle that draws nothing, or one switched on but no longer slotted, never wakes the clock.
 * Each tick draws at the toggle's researched Mark (#249: its ladder steps the draw down).
 */
import { TICKS_PER_SECOND } from '../../../constants/physics'
import {
  vehicleOf,
  withVehicle,
  type AuthorityState,
} from '../../../systems/authority/authorityState'
import { chainEffects, unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import { followEnergyChange } from '../../../systems/authority/vehicleTransitions'
import type { ClockStep } from '../../../systems/registries/clockSteps'
import type { LoadoutSlotId } from '../../../systems/registries/vehicleLoadout'
import { slotHoldingItem } from '../../../systems/vehicle/loadoutState'
import { tileOfPose } from '../../../systems/vehicle/vehiclePose'
import { energyMaxQuantaOf, type VehicleState } from '../../../systems/vehicle/vehicleState'
import {
  drawRemainderOf,
  powerUpStateOf,
  withDrawRemainder,
  withPowerUpState,
  withToggle,
  type PowerUpState,
} from './chargeState'
import { powerUpUsedOf } from './powerUpEvents'
import { powerUpOfItem } from './powerUpKind'
import { atResearchedMark, type MarkedPowerUp } from './powerUpMarks'

export const DRAW_TOGGLES_STEP: ClockStep = {
  id: 'power-up-core.draw-toggles',
  nextTick: nextDrawTick,
  run: drawTogglesAt,
}

/** A toggle switched on in a slot that draws energy, at the player's Mark. */
interface DrawingToggle {
  powerUp: MarkedPowerUp
  slot: LoadoutSlotId
}

/** A tick's draw owes `energyMax x bp` in these parts of a quantum: 10 000 bp a second. */
const DRAW_PARTS_PER_QUANTUM = 10_000 * TICKS_PER_SECOND

/** The whole quanta a tick takes, and the parts of a quantum it leaves owed to the next. */
export interface TickDraw {
  quanta: number
  remainder: number
}

function nextDrawTick(state: AuthorityState): number | null {
  const isDrawing = playerIdsOf(state).some(
    (playerId) => drawingTogglesOf(state, playerId).length > 0,
  )
  return isDrawing ? state.tick + 1 : null
}

function drawTogglesAt(state: AuthorityState, tick: number): RuleEffect {
  return chainEffects(
    state,
    playerIdsOf(state).map(
      (playerId) => (current: AuthorityState) => drawPlayerToggles(current, playerId, tick),
    ),
  )
}

function drawPlayerToggles(state: AuthorityState, playerId: string, tick: number): RuleEffect {
  const drawing = drawingTogglesOf(state, playerId)
  if (drawing.length === 0) return unchanged(state)
  return chainEffects(state, [
    (current) => unchanged(drainTank(current, playerId, drawing)),
    (current) => followEnergyChange(current, playerId, tick),
    (current) => switchOffWhenEmpty(current, playerId, drawing),
  ])
}

/** The slotted, switched-on toggles that draw, of an active vehicle with a pose; else none. */
function drawingTogglesOf(state: AuthorityState, playerId: string): DrawingToggle[] {
  const vehicle = vehicleOf(state, playerId)
  if (vehicle.mode !== 'active' || vehicle.pose === null) return []
  return powerUpStateOf(state, playerId)
    .toggledOn.map((itemId) => drawingToggleOf(state, playerId, vehicle, itemId))
    .filter((toggle): toggle is DrawingToggle => toggle !== null)
}

function drawingToggleOf(
  state: AuthorityState,
  playerId: string,
  vehicle: VehicleState,
  itemId: string,
): DrawingToggle | null {
  const powerUp = powerUpOfItem(itemId)
  const slot = slotHoldingItem(vehicle.loadout, itemId)
  if (powerUp === null || slot === null || powerUp.energyDrawBpPerSecond === 0) return null
  return { powerUp: atResearchedMark(state, playerId, powerUp), slot }
}

/**
 * The quanta the toggles take from the player's tank on this tick's draw, before the tank's floor
 * at zero: what a rule watching the tank for the player's own spending leaves out (ticket 204:
 * the rivet patch's hold).
 */
export function toggleDrawQuantaOf(state: AuthorityState, playerId: string): number {
  const drawing = drawingTogglesOf(state, playerId)
  if (drawing.length === 0) return 0
  return playerTickDrawOf(state, playerId, drawing).quanta
}

/**
 * The tick's draw of `energyMax` at `drawBpPerSecond`, with the parts owed from the last tick: the
 * whole quanta now and the rest carried, so N ticks draw exactly N x energyMax x bp / 600 000.
 */
export function tickDrawOf(
  energyMaxQuanta: number,
  drawBpPerSecond: number,
  remainder: number,
): TickDraw {
  const owed = energyMaxQuanta * drawBpPerSecond + remainder
  return {
    quanta: Math.floor(owed / DRAW_PARTS_PER_QUANTUM),
    remainder: owed % DRAW_PARTS_PER_QUANTUM,
  }
}

function drainTank(
  state: AuthorityState,
  playerId: string,
  drawing: readonly DrawingToggle[],
): AuthorityState {
  const vehicle = vehicleOf(state, playerId)
  const draw = playerTickDrawOf(state, playerId, drawing)
  const energy = Math.max(0, vehicle.energy - draw.quanta)
  const value = withDrawRemainder(powerUpStateOf(state, playerId), draw.remainder)
  return withPowerUpState(withVehicle(state, playerId, { ...vehicle, energy }), playerId, value)
}

function playerTickDrawOf(
  state: AuthorityState,
  playerId: string,
  drawing: readonly DrawingToggle[],
): TickDraw {
  return tickDrawOf(
    energyMaxQuantaOf(vehicleOf(state, playerId)),
    drawBpPerSecondOf(drawing),
    drawRemainderOf(powerUpStateOf(state, playerId)),
  )
}

function drawBpPerSecondOf(drawing: readonly DrawingToggle[]): number {
  return drawing.reduce((sum, toggle) => sum + toggle.powerUp.energyDrawBpPerSecond, 0)
}

function switchOffWhenEmpty(
  state: AuthorityState,
  playerId: string,
  drawing: readonly DrawingToggle[],
): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  if (vehicle.energy > 0 || vehicle.pose === null) return unchanged(state)
  const origin = tileOfPose(vehicle.pose)
  const value = drawing.reduce<PowerUpState>(
    (current, toggle) => withToggle(current, toggle.powerUp.itemId, false),
    powerUpStateOf(state, playerId),
  )
  return {
    state: withPowerUpState(state, playerId, value),
    events: drawing.map((toggle) => ({
      ...powerUpUsedOf(
        { playerId, itemId: toggle.powerUp.itemId, slot: toggle.slot },
        { originTx: origin.tx, originTy: origin.ty },
        0,
        toggle.powerUp.mark,
      ),
      toggledOn: false,
    })),
  }
}

/** Sorted, so two players drain in the same order on every machine. */
function playerIdsOf(state: AuthorityState): string[] {
  return Object.keys(state.players).sort()
}
