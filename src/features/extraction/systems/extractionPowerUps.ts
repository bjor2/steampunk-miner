/**
 * The mineral drain as `power-up-core` runs it (#162 2.1, 4.2): a channel of two charges that
 * refill at the dock, a 900-tick cooldown and a 60-tick hold, during which moving cancels it and
 * returns the charge. These are the Mark 1 numbers: power-up-core steps them with the drain's
 * ladder at the Mark researched (#249), and hands the use its cells per use as the magnitude.
 */
import type { PowerUp } from '../../power-up-core'
import { balanceOf, type ExtractionItem } from './extractionItems'
import { drainMinerals, toolOf } from './mineralDrain'

export function powerUpOfDrain(item: ExtractionItem): PowerUp {
  const balance = balanceOf(item)
  return {
    id: toolOf(item),
    itemId: item.itemId,
    iconId: item.iconId,
    name: item.name,
    powerUpClass: 'channel',
    charges: balance.charges,
    cooldownTicks: balance.cooldownTicks,
    windupTicks: 0,
    channelTicks: balance.actTicks,
    isToggle: false,
    energyDrawPerMillePerSecond: 0,
    activate: drainMinerals,
  }
}
