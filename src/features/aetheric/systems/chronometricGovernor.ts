/**
 * The chronometric governor (#263, the GD lock on #245: pressure and clockwork, the slow verb):
 * one pocket per slot tap. When the wind-up ends a pocket opens round the tile the vehicle stood on
 * when it was pressed (the use's origin), and every enemy within its range steps at half speed
 * (the kernel's `enemyStepModifiers`, ticket 375, read in `governorPockets.ts`) from the next tick
 * until the pocket ends. The vehicle is never slowed or sped up, so the #233 motion cap is
 * untouched. It adds a verb, never yield: no cell changes and no ore moves.
 *
 * The pocket costs energy each tick it holds and heat onto the item gauge when it opens (the lock:
 * energy per tick plus heat, no new resource). The open pays the first tick; a tank that cannot
 * pay it refuses the use, and a refused use costs nothing. A tank that runs dry closes the pocket
 * early. Only a player whose slot holds the governor can press it, so ownership is settled at the
 * press (the HS decision on #263 Q2), never when an enemy's step is read. A new pocket replaces
 * the old one. The pocket lasts the use's Mark magnitude (#249) in ticks.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import {
  vehicleOf,
  withVehicle,
  type AuthorityState,
} from '../../../systems/authority/authorityState'
import type { PowerUp, PowerUpOutcome, PowerUpUse } from '../../power-up-core'
import type { GovernorBalance } from './aethericEconomy'
import { ENERGY_SHORT, pocketOpenedOf } from './aethericEvents'
import { GOVERNOR_ICON_ID, GOVERNOR_ID, GOVERNOR_NAME, governorBalance } from './governorItem'
import { withItemHeatAdded } from './itemHeat'
import { withPocket, type SlowPocket } from './pocketSection'

/**
 * The governor as `power-up-core` runs it (#162 2.1, 4.2): a charged item whose charges refill at
 * the dock. These are the Mark 1 numbers; power-up-core steps them with the ladder at the Mark
 * researched and hands the use the pocket's duration as its magnitude.
 */
export function governorPowerUp(): PowerUp {
  const balance = governorBalance()
  return {
    id: 'aetheric.chronometric_governor',
    itemId: GOVERNOR_ID,
    iconId: GOVERNOR_ICON_ID,
    name: GOVERNOR_NAME,
    powerUpClass: 'charged',
    charges: balance.charges,
    cooldownTicks: balance.cooldownTicks,
    windupTicks: balance.windupTicks,
    channelTicks: 0,
    isToggle: false,
    energyDrawBpPerSecond: 0,
    activate: openPocket,
  }
}

/** The open: pay the first tick, add the heat, open the pocket; refused on a short tank. */
export function openPocket(state: AuthorityState, use: PowerUpUse): PowerUpOutcome {
  const balance = governorBalance()
  if (!canPayTick(state, use.playerId, balance)) return { kind: 'refused', reason: ENERGY_SHORT }
  const pocket = pocketOfUse(use, balance)
  const paid = withFirstTickPaid(state, use.playerId, balance)
  const heated = withItemHeatAdded(paid, use.playerId, use.tick, balance.heatUnits)
  return {
    kind: 'acted',
    effect: {
      state: withPocket(heated, use.playerId, { pocket }),
      events: [pocketOpenedOfUse(use, pocket, balance)],
    },
  }
}

function canPayTick(state: AuthorityState, playerId: string, balance: GovernorBalance): boolean {
  return vehicleOf(state, playerId).energy >= balance.energyQuantaPerTick
}

function withFirstTickPaid(
  state: AuthorityState,
  playerId: string,
  balance: GovernorBalance,
): AuthorityState {
  const vehicle = vehicleOf(state, playerId)
  return withVehicle(state, playerId, {
    ...vehicle,
    energy: vehicle.energy - balance.energyQuantaPerTick,
  })
}

/** The act's tick has already stepped its enemies, so the pocket slows from the next one. */
function pocketOfUse(use: PowerUpUse, balance: GovernorBalance): SlowPocket {
  return {
    tx: use.origin.tx,
    ty: use.origin.ty,
    reachMm: balance.rangeTiles * MM_PER_METRE,
    lastTick: use.tick + durationOf(use, balance),
    paidThroughTick: use.tick + 1,
  }
}

/** The pocket's ticks at the use's Mark; the bought duration for a use read without one. */
function durationOf(use: PowerUpUse, balance: GovernorBalance): number {
  return use.magnitude ?? balance.durationTicks
}

function pocketOpenedOfUse(use: PowerUpUse, pocket: SlowPocket, balance: GovernorBalance) {
  return pocketOpenedOf({
    playerId: use.playerId,
    itemId: use.itemId,
    tx: pocket.tx,
    ty: pocket.ty,
    rangeTiles: balance.rangeTiles,
    durationTicks: pocket.lastTick - use.tick,
    energyPerTick: balance.energyQuantaPerTick,
    heat: balance.heatUnits,
  })
}
