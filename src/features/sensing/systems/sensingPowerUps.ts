/**
 * Each shipped sensing item as `power-up-core` runs it (#162 section 2.1 classes, section 4
 * numbers): the echo sounder is charged and refills at the dock, the flare mortar and the signal
 * buoy come as a stack, and the three passives are on while owned, with no charges and no draw
 * (4.4). These are the Mark 1 numbers; power-up-core steps them with each item's ladder (#249).
 *
 * Every use is reveal only (the TD lock on #203 Q1): it acts on nothing in the authority state,
 * so the world, the digest and the goldens stay as they were. What a use shows is derived on each
 * client from its `PowerUpUsed` event (`systems/revealBoard.ts`). No use changes a cell, so none
 * is ever blocked by a gate, and none is refused.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { PowerUp, PowerUpOutcome } from '../../power-up-core'
import type { SensingItem } from './sensingCatalogue'
import { SHIPPED_SENSING_ITEMS } from './sensingContent'
import { chargedBalanceOf, consumableBalanceOf } from './sensingItems'

type PowerUpRules = Pick<PowerUp, 'powerUpClass' | 'charges' | 'cooldownTicks' | 'windupTicks'>

export const SENSING_POWER_UPS: readonly PowerUp[] = SHIPPED_SENSING_ITEMS.map(powerUpOf)

function powerUpOf(item: SensingItem): PowerUp {
  return {
    id: `sensing.${shortNameOf(item.itemId)}`,
    itemId: item.itemId,
    iconId: item.iconId,
    name: item.name,
    channelTicks: 0,
    isToggle: false,
    energyDrawPerMillePerSecond: 0,
    activate: item.powerUpClass === 'passive' ? stayOn : revealOnly,
    ...rulesOf(item),
  }
}

/** `power.echo_sounder` is `echo_sounder`. */
function shortNameOf(itemId: string): string {
  return itemId.slice(itemId.indexOf('.') + 1)
}

function rulesOf(item: SensingItem): PowerUpRules {
  if (item.powerUpClass === 'charged') return chargedRulesOf(item)
  if (item.powerUpClass === 'consumable') return consumableRulesOf(item)
  return { powerUpClass: 'passive', charges: 0, cooldownTicks: 0, windupTicks: 0 }
}

function chargedRulesOf(item: SensingItem): PowerUpRules {
  const { charges, cooldownTicks, windupTicks } = chargedBalanceOf(item)
  return { powerUpClass: 'charged', charges, cooldownTicks, windupTicks }
}

function consumableRulesOf(item: SensingItem): PowerUpRules {
  const { stack, windupTicks } = consumableBalanceOf(item)
  return { powerUpClass: 'consumable', charges: stack, cooldownTicks: 0, windupTicks }
}

/** The use acts and changes nothing: what it reveals is drawn from its `PowerUpUsed` event. */
function revealOnly(state: AuthorityState): PowerUpOutcome {
  return { kind: 'acted', effect: { state, events: [] } }
}

/** A passive is on while owned and is never pressed from a slot (#162 2.1). */
function stayOn(): PowerUpOutcome {
  return { kind: 'refused', reason: 'sensing.always_on' }
}
