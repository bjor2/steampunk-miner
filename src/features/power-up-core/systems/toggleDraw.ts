/**
 * Toggles that draw energy (#162 section 4.4, the GD lock on #204 Q3 a, ticket 233): every tick
 * an active vehicle has a drawing toggle switched on in a slot, the tank loses the toggles' share
 * of `energyMax` a second, as whole quanta a tick rounded up so a draw is never missed. The tank
 * then follows the kernel's energy rules, the same as after thrust: the low-energy lines, and a
 * strand at zero outside the pad, with no special case. At zero every drawing toggle switches
 * off, logged as the `PowerUpUsed {toggledOn: false}` a switch-off press logs.
 *
 * A toggle that draws nothing, or one switched on but no longer slotted, never wakes the clock.
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
import { powerUpStateOf, withPowerUpState, withToggle, type PowerUpState } from './chargeState'
import { powerUpUsedOf } from './powerUpEvents'
import { powerUpOfItem, type PowerUp } from './powerUpKind'

export const DRAW_TOGGLES_STEP: ClockStep = {
  id: 'power-up-core.draw-toggles',
  nextTick: nextDrawTick,
  run: drawTogglesAt,
}

/** A toggle switched on in a slot that draws energy. */
interface DrawingToggle {
  powerUp: PowerUp
  slot: LoadoutSlotId
}

const PER_MILLE = 1000

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
    .toggledOn.map((itemId) => drawingToggleOf(vehicle, itemId))
    .filter((toggle): toggle is DrawingToggle => toggle !== null)
}

function drawingToggleOf(vehicle: VehicleState, itemId: string): DrawingToggle | null {
  const powerUp = powerUpOfItem(itemId)
  const slot = slotHoldingItem(vehicle.loadout, itemId)
  if (powerUp === null || slot === null || powerUp.energyDrawPerMillePerSecond === 0) return null
  return { powerUp, slot }
}

/**
 * The quanta the toggles take from the player's tank on this tick's draw, before the tank's floor
 * at zero: what a rule watching the tank for the player's own spending leaves out (ticket 204:
 * the rivet patch's hold).
 */
export function toggleDrawQuantaOf(state: AuthorityState, playerId: string): number {
  const drawing = drawingTogglesOf(state, playerId)
  if (drawing.length === 0) return 0
  return drawQuantaPerTickOf(vehicleOf(state, playerId), drawing)
}

function drainTank(
  state: AuthorityState,
  playerId: string,
  drawing: readonly DrawingToggle[],
): AuthorityState {
  const vehicle = vehicleOf(state, playerId)
  const energy = Math.max(0, vehicle.energy - drawQuantaPerTickOf(vehicle, drawing))
  return withVehicle(state, playerId, { ...vehicle, energy })
}

/** The toggles' draw a tick in quanta: `energyMax` times the per-mille rate, rounded up. */
function drawQuantaPerTickOf(vehicle: VehicleState, drawing: readonly DrawingToggle[]): number {
  const perMille = drawing.reduce(
    (sum, toggle) => sum + toggle.powerUp.energyDrawPerMillePerSecond,
    0,
  )
  return Math.ceil((energyMaxQuantaOf(vehicle) * perMille) / (PER_MILLE * TICKS_PER_SECOND))
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
      ),
      toggledOn: false,
    })),
  }
}

/** Sorted, so two players drain in the same order on every machine. */
function playerIdsOf(state: AuthorityState): string[] {
  return Object.keys(state.players).sort()
}
