/**
 * Shove aims (ticket 882, PK4c T2; the GD's final lock on #850 and Systems' vane correction,
 * 6395074595): a tool may turn a `shove` contact's push outward from the planet's core while it
 * applies. Only the direction changes: the shove keeps the size its factor leaves it
 * (`hazardShove.ts`), so an aimed shove is never longer than the bare one and adds no speed.
 *
 * With none registered, or none answering, every shove goes along the vent's normal as before.
 */
import type { AuthorityState } from '../authority/authorityState'
import { defineRegistry, entriesOf } from './seal'

export interface ShoveAim {
  /** `<slice>.<aim>`. */
  id: string
  /** The hazard kind whose shoves it aims. */
  kind: string
  /** Whether it turns the player's shove outward now. */
  isAimedOutward(state: AuthorityState, playerId: string): boolean
}

export const SHOVE_AIM_REGISTRY = defineRegistry<ShoveAim>('shoveAims')

/** Whether a registered aim turns the player's shove of `kind` outward now. */
export function isShoveAimedOutward(
  state: AuthorityState,
  playerId: string,
  kind: string,
): boolean {
  return entriesOf(SHOVE_AIM_REGISTRY).some(
    (aim) => aim.kind === kind && aim.isAimedOutward(state, playerId),
  )
}
