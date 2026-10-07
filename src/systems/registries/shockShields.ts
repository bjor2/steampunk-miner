/**
 * What shields a player's drill from an electrified cell while it cuts (GD lock on spec #258 Q6):
 * the dielectric bit's lane answers for the player who carries it (#258 build 4). A shielded cut
 * takes no shock, neither its ticks nor its hull, and `electrified_cell_shocked` says `withBit`.
 * Outside a cut the hull still pays, which is the lining's job, never the bit's. With nothing
 * registered every cut of an electrified cell is shocked.
 */
import type { AuthorityState } from '../authority/authorityState'
import { defineRegistry, entriesOf } from './seal'

export interface ShockShield {
  id: string
  /** Whether the player's drill is shielded now. */
  isShielding(state: AuthorityState, playerId: string): boolean
}

export const SHOCK_SHIELD_REGISTRY = defineRegistry<ShockShield>('shockShields')

/** Whether any registered shield covers the player's drill. */
export function isDrillShielded(state: AuthorityState, playerId: string): boolean {
  return entriesOf(SHOCK_SHIELD_REGISTRY).some((shield) => shield.isShielding(state, playerId))
}
