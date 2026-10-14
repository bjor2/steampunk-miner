/**
 * The resonance whistle (#262, the GD lock on #245: sound, the lure verb): one blow per slot tap.
 * When the wind-up ends the whistle sounds on the tile the vehicle stood on when it was pressed
 * (the use's origin), and every hunter within its reach paths to that cell until the lure ends,
 * then hunts the vehicle again: the kernel's enemy step reads the lure through `enemyLures`
 * (ticket 361, `whistleLures.ts`). It adds a verb, never yield: no cell changes and no ore moves.
 *
 * A blow costs its energy from the tank and nothing else (the lock: energy or heat, no new
 * resource). A tank that cannot pay refuses the use, and a refused use costs nothing. A new blow
 * while one sounds replaces it. The lure lasts the use's Mark magnitude (#249) in ticks.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import {
  vehicleOf,
  withVehicle,
  type AuthorityState,
} from '../../../systems/authority/authorityState'
import type { PowerUp, PowerUpOutcome, PowerUpUse } from '../../power-up-core'
import type { WhistleBalance } from './aethericEconomy'
import { ENERGY_SHORT, whistleSoundedOf } from './aethericEvents'
import { WHISTLE_ICON_ID, WHISTLE_ID, WHISTLE_NAME, whistleBalance } from './whistleItem'
import { withWhistle, type SoundingWhistle } from './whistleSection'

/**
 * The whistle as `power-up-core` runs it (#162 2.1, 4.2): a charged item whose charges refill at
 * the dock. These are the Mark 1 numbers; power-up-core steps them with the ladder at the Mark
 * researched and hands the use the lure's duration as its magnitude.
 */
export function whistlePowerUp(): PowerUp {
  const balance = whistleBalance()
  return {
    id: 'aetheric.resonance_whistle',
    itemId: WHISTLE_ID,
    iconId: WHISTLE_ICON_ID,
    name: WHISTLE_NAME,
    powerUpClass: 'charged',
    charges: balance.charges,
    cooldownTicks: balance.cooldownTicks,
    windupTicks: balance.windupTicks,
    channelTicks: 0,
    isToggle: false,
    energyDrawBpPerSecond: 0,
    activate: soundWhistle,
  }
}

/** The blow: pay its energy, sound the lure on the use's origin tile; refused on a short tank. */
export function soundWhistle(state: AuthorityState, use: PowerUpUse): PowerUpOutcome {
  const balance = whistleBalance()
  if (!canPayBlow(state, use.playerId, balance)) return { kind: 'refused', reason: ENERGY_SHORT }
  const sounding = soundingOf(use, balance)
  const paid = withBlowPaid(state, use.playerId, balance)
  return {
    kind: 'acted',
    effect: {
      state: withWhistle(paid, use.playerId, { sounding }),
      events: [whistleSoundedOfUse(use, sounding, balance)],
    },
  }
}

function canPayBlow(state: AuthorityState, playerId: string, balance: WhistleBalance): boolean {
  return vehicleOf(state, playerId).energy >= balance.energyQuanta
}

function withBlowPaid(
  state: AuthorityState,
  playerId: string,
  balance: WhistleBalance,
): AuthorityState {
  const vehicle = vehicleOf(state, playerId)
  return withVehicle(state, playerId, {
    ...vehicle,
    energy: vehicle.energy - balance.energyQuanta,
  })
}

function soundingOf(use: PowerUpUse, balance: WhistleBalance): SoundingWhistle {
  return {
    tx: use.origin.tx,
    ty: use.origin.ty,
    reachMm: balance.reachTiles * MM_PER_METRE,
    untilTick: use.tick + durationOf(use, balance),
  }
}

/** The lure's ticks at the use's Mark; the bought duration for a use read without one. */
function durationOf(use: PowerUpUse, balance: WhistleBalance): number {
  return use.magnitude ?? balance.durationTicks
}

function whistleSoundedOfUse(use: PowerUpUse, sounding: SoundingWhistle, balance: WhistleBalance) {
  return whistleSoundedOf({
    playerId: use.playerId,
    itemId: use.itemId,
    tx: sounding.tx,
    ty: sounding.ty,
    reachTiles: balance.reachTiles,
    durationTicks: sounding.untilTick - use.tick,
    energy: balance.energyQuanta,
  })
}
