/**
 * Overpressure's HUD toggle (ticket 388; Content's node table on #310: "hold the HUD toggle"), as a
 * pure model over the replica: shown only while the turret's live modules give it a burst cycle
 * (`turretShapes.ts`), so an unattached or unowned Overpressure offers nothing. Its press sends
 * the kernel's own `turret.burst` (K-burst, ticket 383), which latches the cycle on the server:
 * on, the guns rattle at the faster cadence until the vent; off, a running burst vents in full.
 */
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { burstPhaseOf, isBurstOn, type BurstPhase } from '../../../systems/vehicle/gunBurst'
import { playerTurretShapeOf } from './turretShapes'

export interface BurstToggleModel {
  isOn: boolean
  /** Where the latched cycle is now: firing fast, venting, or idle. */
  phase: BurstPhase
}

/** The toggle as the player sees it; null while the turret has no burst to switch. */
export function burstToggleOf(state: AuthorityState, playerId: string): BurstToggleModel | null {
  if (playerTurretShapeOf(state, playerId)?.burst == null) return null
  const { gunBurst } = vehicleOf(state, playerId)
  return { isOn: isBurstOn(gunBurst), phase: burstPhaseOf(gunBurst, state.tick) }
}

/** The press: switch the burst the other way. */
export function burstToggleIntentOf(toggle: BurstToggleModel): CommandIntent {
  return { type: 'turret.burst', payload: { on: !toggle.isOn } }
}
