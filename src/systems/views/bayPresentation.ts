/**
 * How the bay screens move and read (#45 art direction, #44 install animation): the shutter that
 * opens and closes a bay screen, the part that bolts on after a purchase, and the smallest text
 * size. Presentation only: none of it is a command, a log line or part of the digest.
 *
 * "Reduce motion" is the shake switch, as it is for the vehicle's part motion (#33, #48).
 */
import {
  BAY_SHUTTER_SECONDS,
  PART_INSTALL_SECONDS,
  SHOP_TEXT_SHORT_AXIS_SHARE,
} from '../../constants/scene'
import type { DomainEvent } from '../authority/domainEvent'
import { UPGRADE_IDS, type UpgradeId } from '../economy/economyDefinition'

export interface BayTransition {
  /** A brass shutter slides the panel in and out; with reduce motion it fades instead (#45). */
  kind: 'shutter' | 'fade'
  seconds: number
}

/** The type a bay screen is set in at one screen size (#45 acceptance 2). */
export interface ShopType {
  shortAxisPixels: number
  /** Every text on a bay screen is at least this tall: the body size, labels and titles alike. */
  smallestTextPixels: number
}

export function bayTransitionOf(isMotionReduced: boolean): BayTransition {
  return { kind: isMotionReduced ? 'fade' : 'shutter', seconds: BAY_SHUTTER_SECONDS }
}

/** 0.4 s of bolting on and steam, or none with reduce motion: the change is instant (#44). */
export function partInstallSecondsOf(isMotionReduced: boolean): number {
  return isMotionReduced ? 0 : PART_INSTALL_SECONDS
}

/**
 * The track whose part starts installing after this batch: the local player's last purchase in
 * it, or null when nothing was bought or reduce motion skips the animation.
 */
export function partToInstallOf(
  events: readonly DomainEvent[],
  playerId: string,
  isMotionReduced: boolean,
): UpgradeId | null {
  if (partInstallSecondsOf(isMotionReduced) === 0) return null
  const purchases = events.filter(
    (event) => event.type === 'UpgradePurchased' && event.playerId === playerId,
  )
  const last = purchases.at(-1)
  return last?.type === 'UpgradePurchased' ? upgradeIdOf(last.upgradeId) : null
}

export function shopTypeOf(widthPixels: number, heightPixels: number): ShopType {
  const shortAxisPixels = Math.min(widthPixels, heightPixels)
  return { shortAxisPixels, smallestTextPixels: shortAxisPixels * SHOP_TEXT_SHORT_AXIS_SHARE }
}

function upgradeIdOf(id: string): UpgradeId | null {
  return UPGRADE_IDS.find((upgradeId) => upgradeId === id) ?? null
}
