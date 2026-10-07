/**
 * The `power-up` entry of each drill-gear item (#162 section 2.1, `power-up-core`'s kind): heads
 * are passives on while slotted, the side cutters, auger and boom are toggles, and the corer is a
 * charged item. Switching a toggle on changes nothing by itself: its effect is the drill gear read
 * or the auger's step, which read whether it is engaged. Numbers are Mark 1 (`items.balance`).
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged } from '../../../systems/authority/commandRule'
import type { PowerUp, PowerUpOutcome } from '../../power-up-core'
import { balanceOf, type DrillGearItem } from './drillGearItems'
import { sampleOreAhead, SAMPLING_CORER_ID } from './samplingCorer'

/** Basis points of `energyMax` a second in one per-mille step of the `power-up` kind's draw. */
const BASIS_POINTS_PER_MILLE = 10

export function powerUpOf(item: DrillGearItem): PowerUp {
  const balance = balanceOf(item)
  return {
    id: `drill-gear.${item.itemId.slice('gear.'.length)}`,
    itemId: item.itemId,
    iconId: item.iconId,
    name: item.name,
    powerUpClass: item.powerUpClass,
    charges: balance.charges ?? 0,
    cooldownTicks: balance.cooldownTicks ?? 0,
    windupTicks: balance.windUpTicks ?? 0,
    channelTicks: 0,
    isToggle: item.isToggle,
    energyDrawPerMillePerSecond: drawPerMilleOf(item.itemId, balance.drawBpPerSecond ?? 0),
    activate: item.itemId === SAMPLING_CORER_ID ? sampleOreAhead : actsThroughItsEffect,
  }
}

/** #162 4.4 gives draws in tenths of a percent, so a draw that splits a per-mille is a bad file. */
function drawPerMilleOf(itemId: string, drawBpPerSecond: number): number {
  if (drawBpPerSecond % BASIS_POINTS_PER_MILLE !== 0) {
    throw new RangeError(`${itemId} draws ${drawBpPerSecond} bp a second, not whole per mille`)
  }
  return drawBpPerSecond / BASIS_POINTS_PER_MILLE
}

function actsThroughItsEffect(state: AuthorityState): PowerUpOutcome {
  return { kind: 'acted', effect: unchanged(state) }
}
