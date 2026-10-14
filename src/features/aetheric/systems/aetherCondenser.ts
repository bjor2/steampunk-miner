/**
 * The aether condenser (#263, the GD lock on #245: boiler and aether, the condense verb): one burn
 * per slot tap. When the wind-up ends it burns the item heat gauge down into the tank at the
 * kernel's ratio (`condense`, #360), whole exchanges only, stopping at full charge; a remainder
 * smaller than one exchange, or what a full tank leaves, stays on the gauge. Its cost is the heat
 * it burns (the lock: heat, no new resource), and it adds a verb, never yield.
 *
 * A press with nothing to burn is refused and costs nothing: a full tank (`tank_full`), or less
 * heat than one exchange (`no_heat`). The gauge is the off-act item gauge (the GD ruling on #263
 * Q1 a), never the Fire act's.
 */
import { CONDENSE_RATIO, condense } from '../../../systems/aetheric/condense'
import {
  vehicleOf,
  withVehicle,
  type AuthorityState,
} from '../../../systems/authority/authorityState'
import { energyMaxQuantaOf } from '../../../systems/vehicle/vehicleState'
import type { PowerUp, PowerUpOutcome, PowerUpUse } from '../../power-up-core'
import { heatCondensedOf, NO_HEAT, TANK_FULL } from './aethericEvents'
import { CONDENSER_ICON_ID, CONDENSER_ID, CONDENSER_NAME, condenserBalance } from './condenserItem'
import { itemHeatUnitsAt, withItemHeatUnits } from './itemHeat'

/** What one burn starts from and leaves. */
interface Burn {
  heatBefore: number
  energyBefore: number
  heatAfter: number
  energyAfter: number
}

/**
 * The condenser as `power-up-core` runs it (#162 2.1, 4.2): a charged item whose charges refill
 * at the dock, with the Mark 1 numbers that power-up-core steps with the ladder.
 */
export function condenserPowerUp(): PowerUp {
  const balance = condenserBalance()
  return {
    id: 'aetheric.aether_condenser',
    itemId: CONDENSER_ID,
    iconId: CONDENSER_ICON_ID,
    name: CONDENSER_NAME,
    powerUpClass: 'charged',
    charges: balance.charges,
    cooldownTicks: balance.cooldownTicks,
    windupTicks: balance.windupTicks,
    channelTicks: 0,
    isToggle: false,
    energyDrawBpPerSecond: 0,
    activate: condenseItemHeat,
  }
}

/** The burn: heat off the gauge, energy into the tank; refused when there is nothing to burn. */
export function condenseItemHeat(state: AuthorityState, use: PowerUpUse): PowerUpOutcome {
  const burn = burnOf(state, use)
  const refusal = refusalOfBurn(burn)
  if (refusal !== null) return { kind: 'refused', reason: refusal }
  return {
    kind: 'acted',
    effect: { state: withBurn(state, use, burn), events: [heatCondensedOfUse(use, burn)] },
  }
}

function burnOf(state: AuthorityState, use: PowerUpUse): Burn {
  const vehicle = vehicleOf(state, use.playerId)
  const heatBefore = itemHeatUnitsAt(state, use.playerId, use.tick)
  const after = condense(heatBefore, vehicle.energy, energyMaxQuantaOf(vehicle), CONDENSE_RATIO)
  return {
    heatBefore,
    energyBefore: vehicle.energy,
    heatAfter: after.heat,
    energyAfter: after.energy,
  }
}

function refusalOfBurn(burn: Burn): string | null {
  if (burn.energyAfter > burn.energyBefore) return null
  return burn.heatBefore >= CONDENSE_RATIO ? TANK_FULL : NO_HEAT
}

function withBurn(state: AuthorityState, use: PowerUpUse, burn: Burn): AuthorityState {
  const cooled = withItemHeatUnits(state, use.playerId, use.tick, burn.heatAfter)
  const vehicle = vehicleOf(cooled, use.playerId)
  return withVehicle(cooled, use.playerId, { ...vehicle, energy: burn.energyAfter })
}

function heatCondensedOfUse(use: PowerUpUse, burn: Burn) {
  return heatCondensedOf({
    playerId: use.playerId,
    itemId: use.itemId,
    heat: burn.heatBefore - burn.heatAfter,
    energy: burn.energyAfter - burn.energyBefore,
  })
}
