/**
 * Quench cutters (ticket 373, aetheric × drill-gear; Content's definition as the GD ruled it on 14
 * Oct): with the combo in play and the side cutters engaged, the flank cutters' heat goes onto the
 * off-act item gauge (#263 a) for every second the drill digs, counted in the step's dig ticks and
 * never per cell, and the condenser drinks it with the rest of the gauge at its own kernel ratio,
 * stopping at full charge. So the refund is paid per second of dig time and never beats the
 * condenser's `condenseRatio` (the ruling's cap). The heat is gauge-only: it never throttles,
 * damages or slows the vehicle and never reaches the Fire act's gauge. Cut speed and width, yield
 * and the drill's own draw are unchanged; drilling adds no heat without the cutters.
 *
 * A condenser run while the cutters are engaged is the combo's use: it logs `power_up_used` and
 * `aetheric.heat_condensed` as ever, beside `aetheric.cutters_quenched`. It rides the player's own
 * press, so it never presses anything for them and cannot take a press they just made (#328).
 */
import { TICKS_PER_SECOND } from '../../../constants/physics'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import type { AuthorityReaction } from '../../../systems/registries/authorityReactions'
import { isToggleEngaged } from '../../power-up-core'
import { AETHERIC_ECONOMY } from './aethericEconomy'
import { cuttersQuenchedOf } from './aethericEvents'
import { isComboInPlay, QUENCH_CUTTERS_ID } from './aethericCombos'
import { CONDENSER_ID } from './condenserItem'
import { withItemHeatAdded } from './itemHeat'

const SIDE_CUTTERS = 'gear.side_cutters'

type DrillDamageDealt = Extract<DomainEvent, { type: 'DrillDamageDealt' }>
type HeatCondensed = Extract<DomainEvent, { type: 'aetheric.HeatCondensed' }>

export const QUENCH_CUTTERS_REACTION: AuthorityReaction = {
  id: 'aetheric.quench-cutters',
  react: (_before, after, heard) => quenchOf(after, heard),
}

function quenchOf(state: AuthorityState, heard: readonly DomainEvent[]): RuleEffect {
  const playerId = heard[0]?.playerId
  if (playerId === undefined || !isQuenching(state, playerId)) return unchanged(state)
  return {
    state: withCutterHeat(state, playerId, heard),
    events: quenchedEventsOf(heard),
  }
}

/** The combo plays and the side cutters are engaged. */
export function isQuenching(state: AuthorityState, playerId: string): boolean {
  return (
    isComboInPlay(state, playerId, QUENCH_CUTTERS_ID) &&
    isToggleEngaged(state, playerId, SIDE_CUTTERS)
  )
}

/** The cutters' heat for the step's dig time, on the item gauge at the step's tick. */
function withCutterHeat(
  state: AuthorityState,
  playerId: string,
  heard: readonly DomainEvent[],
): AuthorityState {
  const dug = heard.filter(isDrillDamage)
  const heat = cutterHeatOfDigTicks(digTicksOf(dug))
  if (heat === 0) return state
  return withItemHeatAdded(state, playerId, dug[0].tick, heat)
}

/**
 * The ticks the drill dug this step: each drill pass logs the ticks it used once, for its target
 * and every gear cell it cut beside it alike, so the passes' ticks add up to the dig time and the
 * count of cells never adds to it.
 */
export function digTicksOf(dug: readonly DrillDamageDealt[]): number {
  return dug.reduce((ticks, event) => ticks + event.ticks, 0)
}

/** Whole heat units for `digTicks` of digging; a part unit is never paid. */
export function cutterHeatOfDigTicks(digTicks: number): number {
  const perSecond = AETHERIC_ECONOMY.combo.quenchCutters.heatUnitsPerDigSecond
  return Math.floor((perSecond * digTicks) / TICKS_PER_SECOND)
}

function quenchedEventsOf(heard: readonly DomainEvent[]) {
  return heard.filter(isCondenserBurn).map((burn) =>
    cuttersQuenchedOf({
      playerId: burn.playerId,
      itemId: QUENCH_CUTTERS_ID,
      heat: burn.heat,
      energy: burn.energy,
    }),
  )
}

function isDrillDamage(event: DomainEvent): event is DrillDamageDealt {
  return event.type === 'DrillDamageDealt'
}

function isCondenserBurn(event: DomainEvent): event is HeatCondensed {
  return event.type === 'aetheric.HeatCondensed' && event.itemId === CONDENSER_ID
}
