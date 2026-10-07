/**
 * The sibling-link Mark milestone (the GD lock on #256, build 3; Systems and G&V rules adopted):
 * once the player's Mark reaches an item's sibling-link, the item's act also fires the sibling it
 * names, at reduced strength, from the sibling's own slot.
 *
 * - The link fires only while the player has it on, and only if the sibling is in an open power-up
 *   slot and ready: a charge left, its cooldown run, not acting. A sibling that is still a vision
 *   row is never registered, so never slotted, and never fires.
 * - It spends the sibling's own charge and starts its own cooldown; a sibling that counts no
 *   charges never fires, so a milestone never yields a use without spending a charge.
 * - A link that does not fire, or whose sibling finds nothing to act on or is refused by a gate,
 *   changes nothing and writes nothing: the item's own act and log are as if it had no link.
 * - A linked act never fires the sibling's own link, and is a plain use even when the item's act
 *   was a hold or a second tap.
 * - An item whose link fires at a later moment than its act (`linkMoment: 'own'`, a steam shield's
 *   break, ticket 275) fires it through `fireSiblingLinkAt` when its slice says so.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { VehicleState } from '../../../systems/vehicle/vehicleState'
import { markLadderOfItem, researchedMarkOf, type MarkLadder } from '../../tech-tree'
import {
  chargesLeftIn,
  isLinkOn,
  itemChargesOf,
  powerUpStateOf,
  withItemCharges,
  withPowerUpState,
  type PowerUpState,
} from './chargeState'
import { linkFiredOf } from './powerUpEvents'
import { POWER_UP_CORE_ECONOMY } from './powerUpEconomy'
import { hasCharges, type PowerUp, type PowerUpUse } from './powerUpKind'
import { atResearchedMark, type MarkedPowerUp } from './powerUpMarks'
import { POWER_UP_SLOTS, type PowerUpSlot } from './powerUpSlots'
import { pressablePowerUpOf } from './useRefusals'

/** An item's sibling-link: its act fires `siblingId`. */
export interface SiblingLink {
  itemId: string
  siblingId: string
}

/** Who fires the link, and when and from where: a use as it acts, or the item's own moment. */
export type LinkMoment = Pick<PowerUpUse, 'playerId' | 'itemId' | 'tick' | 'origin'>

interface SlottedPowerUp {
  slot: PowerUpSlot
  powerUp: PowerUp
}

interface ReadySibling {
  powerUp: MarkedPowerUp
  slot: PowerUpSlot
}

const BASIS_POINTS = 10_000

/** The item's sibling-link once the player's Mark has reached it, on or off; null before. */
export function reachedSiblingLinkOf(
  state: AuthorityState,
  playerId: string,
  itemId: string,
): SiblingLink | null {
  const milestone = linkMilestoneOf(markLadderOfItem(itemId))
  if (milestone === null || researchedMarkOf(state, playerId, itemId) < milestone.mark) return null
  return { itemId, siblingId: milestone.siblingId }
}

/**
 * After the item acted: its link fires the sibling, appending the sibling's effect and log. An item
 * whose link fires at its own moment (`linkMoment: 'own'`) leaves the act as it is.
 */
export function withSiblingLink(acted: RuleEffect, use: PowerUpUse, powerUp: PowerUp): RuleEffect {
  if (powerUp.linkMoment === 'own') return acted
  return withLinkFiredAt(acted, use)
}

/**
 * The item's link fired at a moment its slice names (`linkMoment: 'own'`), such as a steam
 * shield's break: the same rules as on an act, at the moment's tick and from its origin.
 */
export function fireSiblingLinkAt(state: AuthorityState, moment: LinkMoment): RuleEffect {
  return withLinkFiredAt(unchanged(state), moment)
}

function withLinkFiredAt(acted: RuleEffect, moment: LinkMoment): RuleEffect {
  const link = liveSiblingLinkOf(acted.state, moment.playerId, moment.itemId)
  if (link === null) return acted
  const fired = fireSiblingLink(acted.state, moment, link)
  return { state: fired.state, events: [...acted.events, ...fired.events] }
}

function liveSiblingLinkOf(
  state: AuthorityState,
  playerId: string,
  itemId: string,
): SiblingLink | null {
  const link = reachedSiblingLinkOf(state, playerId, itemId)
  if (link === null || !isLinkOn(powerUpStateOf(state, playerId), itemId)) return null
  return link
}

function fireSiblingLink(state: AuthorityState, moment: LinkMoment, link: SiblingLink): RuleEffect {
  const sibling = readySiblingOf(state, moment, link.siblingId)
  if (sibling === null) return unchanged(state)
  const outcome = sibling.powerUp.activate(state, linkedUseOf(moment, sibling))
  if (outcome.kind !== 'acted') return unchanged(state)
  return spendSibling(outcome.effect, moment, link, sibling)
}

function linkMilestoneOf(ladder: MarkLadder | null): { mark: number; siblingId: string } | null {
  const milestone = ladder?.milestones?.find(({ pattern }) => pattern === 'sibling-link')
  if (milestone?.siblingId === undefined) return null
  return { mark: milestone.mark, siblingId: milestone.siblingId }
}

function readySiblingOf(
  state: AuthorityState,
  moment: LinkMoment,
  siblingId: string,
): ReadySibling | null {
  const slotted = slottedSiblingOf(vehicleOf(state, moment.playerId), siblingId)
  if (slotted === null) return null
  const powerUp = atResearchedMark(state, moment.playerId, slotted.powerUp)
  const value = powerUpStateOf(state, moment.playerId)
  return isReadyToLink(value, powerUp, moment.tick) ? { powerUp, slot: slotted.slot } : null
}

/** The open power-up slot a press uses that holds the item, first slot first; null for none. */
function slottedSiblingOf(vehicle: VehicleState, itemId: string): SlottedPowerUp | null {
  const slotted = POWER_UP_SLOTS.map((slot) => ({
    slot,
    powerUp: pressablePowerUpOf(vehicle, slot),
  }))
  return slotted.find((entry): entry is SlottedPowerUp => entry.powerUp?.itemId === itemId) ?? null
}

function isReadyToLink(value: PowerUpState, powerUp: MarkedPowerUp, tick: number): boolean {
  return hasChargeToSpend(value, powerUp) && isIdle(value, powerUp, tick)
}

function hasChargeToSpend(value: PowerUpState, powerUp: MarkedPowerUp): boolean {
  return hasCharges(powerUp) && chargesLeftIn(value, powerUp) > 0
}

/** Its cooldown has run and it is not winding up or channelling. */
function isIdle(value: PowerUpState, powerUp: MarkedPowerUp, tick: number): boolean {
  const isCooledDown = tick >= itemChargesOf(value, powerUp.itemId).readyAtTick
  return isCooledDown && value.pending?.itemId !== powerUp.itemId
}

/**
 * The sibling's use: from the item's origin and tick, its own slot and Mark, at link strength. It
 * is a plain use: the item's follow-up milestone (ticket 273) is the item's verb, not the sibling's.
 */
function linkedUseOf(moment: LinkMoment, { powerUp, slot }: ReadySibling): PowerUpUse {
  const { playerId, tick, origin } = moment
  return {
    playerId,
    itemId: powerUp.itemId,
    slot,
    tick,
    origin,
    mark: powerUp.mark,
    magnitude: linkStrengthOf(powerUp.magnitude),
    linkedFrom: moment.itemId,
  }
}

/** Rounded down to whole units, as every ladder magnitude is. */
function linkStrengthOf(magnitude: number | null): number | null {
  if (magnitude === null) return null
  return Math.floor((magnitude * POWER_UP_CORE_ECONOMY.siblingLinkStrengthBp) / BASIS_POINTS)
}

/** One charge spent, the sibling's cooldown at its Mark started, its tile's flash marked. */
function spendSibling(
  effect: RuleEffect,
  moment: LinkMoment,
  link: SiblingLink,
  { powerUp, slot }: ReadySibling,
): RuleEffect {
  const value = powerUpStateOf(effect.state, moment.playerId)
  const charges = itemChargesOf(value, powerUp.itemId)
  const spent = withItemCharges(value, powerUp.itemId, {
    spent: charges.spent + 1,
    readyAtTick: moment.tick + powerUp.cooldownTicks,
    linkedAtTick: moment.tick,
  })
  return {
    state: withPowerUpState(effect.state, moment.playerId, spent),
    events: [...effect.events, linkFiredOf(moment.playerId, link, slot)],
  }
}
