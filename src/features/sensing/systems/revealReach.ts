/**
 * How far and how long a use reveals at the Mark it acted at (#162 4.2, 4.3 and 4.6): the echo's
 * reveal ticks, the flare's mapped radius and the buoy's re-ping ring are each item's ladder
 * magnitude; the echo's radius and the mortar's range are fixed. A buoy's re-ping lingers as long
 * as a bought echo's ping: #162 gives the buoy a ring radius and no reveal time of its own.
 */
import { markStepOf } from '../../tech-tree'
import { sensingItemOf, type SensingItem } from './sensingCatalogue'
import { chargedBalanceOf, consumableBalanceOf, markLadderOf } from './sensingItems'
import { ECHO_SOUNDER, FLARE_MORTAR, SIGNAL_BUOY } from './sensingUses'

/** Mark 1 is the item as bought (#162 4.6); Mark 0, none researched, acts as bought. */
const BOUGHT_MARK = 1

export function echoRadiusTiles(): number {
  return chargedBalanceOf(itemNamed(ECHO_SOUNDER)).radiusTiles ?? 0
}

export function echoRevealTicksAt(mark: number): number {
  return magnitudeAt(itemNamed(ECHO_SOUNDER), mark)
}

export function flareRangeTiles(): number {
  return consumableBalanceOf(itemNamed(FLARE_MORTAR)).rangeTiles ?? 0
}

export function flareRadiusTilesAt(mark: number): number {
  return magnitudeAt(itemNamed(FLARE_MORTAR), mark)
}

export function buoyRingTilesAt(mark: number): number {
  return magnitudeAt(itemNamed(SIGNAL_BUOY), mark)
}

export function buoyRepingTicks(): number {
  return echoRevealTicksAt(BOUGHT_MARK)
}

function magnitudeAt(item: SensingItem, mark: number): number {
  return markStepOf(markLadderOf(item), Math.max(mark, BOUGHT_MARK)).stats.magnitude ?? 0
}

function itemNamed(itemId: string): SensingItem {
  const item = sensingItemOf(itemId)
  if (item === null) throw new RangeError(`no sensing row ${itemId}`)
  return item
}
