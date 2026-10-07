/**
 * The Upgrade bay's Guns row (#107 design): shown once `auto_guns` is unlocked on this planet or
 * the guns are already bolted on, and nothing before (#90 vision stub rule). Before the mount the
 * row offers the mount; after it, the next step of the gun track with its rate "now -> next";
 * at the cap it says so and its Buy carries `max_level`.
 */
import type { AuthorityState } from '../authority/authorityState'
import { gunOf, isGunOffered, nextGunPriceOf, nextGunStep } from '../authority/gunRules'
import { GUN_ICON_ID } from '../art/artIds'
import { gunShotsPerSecond, gunTopStep } from '../economy/gunStats'
import { majorOf } from '../economy/upgradeSteps'
import { buyGunCommand } from '../platform/platformCommands'
import { CLICK_CHAIN } from '../authority/purchaseChain'
import { isGunMounted, type VehicleGun } from '../vehicle/vehicleGun'
import { KERNEL_ITEMS } from '../registries/kernelItems'
import { itemCardOf, SHOP_SOURCE, type ItemCardModel } from './itemCardModel'
import { UI_IDS } from './screenIds'
import { stepLevelText } from './stepLevelText'
import { amountReading, commandButton, type AmountReading, type ScreenButton } from './viewParts'
import { buyStateOf, isBuyOpen, type BuyState, type RowBadge } from './workshopRows'

export interface GunRow {
  iconId: string
  label: string
  level: number
  /** "Mount", "1 · 3/9 → 1 · 4/9" or "16 (top)". */
  levelText: string
  /** The fire rate the buy gives: "2 shots/s", or "2 → 2.07 shots/s". */
  effectText: string
  cost: AmountReading
  buy: ScreenButton
  buyState: BuyState
  /** A padlock before the mount, a star at the track's top. */
  badge: RowBadge
  isBuyOpen: boolean
  /** The kernel item card this row draws as, compact (K7 #199). */
  card: ItemCardModel
}

const RATE_DECIMALS = 2

/** The row, or null while the Upgrade bay shows no guns. */
export function gunRowOf(state: AuthorityState, playerId: string): GunRow | null {
  if (!isGunOffered(state, playerId)) return null
  const gun = gunOf(state, playerId)
  const buy = commandButton(
    state,
    playerId,
    UI_IDS.upgradebayGunsBuy,
    buyLabelOf(gun),
    buyGunCommand(CLICK_CHAIN),
  )
  const cost = amountReading(nextGunPriceOf(state, playerId))
  return {
    iconId: GUN_ICON_ID,
    label: 'Guns',
    level: gun.level,
    levelText: levelTextOf(gun),
    effectText: effectTextOf(gun),
    cost,
    buy,
    buyState: buyStateOf(buy),
    badge: badgeOf(gun),
    isBuyOpen: isBuyOpen(buy),
    card: itemCardOf(state, playerId, {
      item: KERNEL_ITEMS.guns,
      iconId: GUN_ICON_ID,
      name: 'Guns',
      cost,
      level: gun.level,
      buy,
      source: SHOP_SOURCE,
    }),
  }
}

function badgeOf(gun: VehicleGun): RowBadge {
  if (!isGunMounted(gun)) return 'locked'
  return isGunAtTop(gun) ? 'maxed' : null
}

function isGunAtTop(gun: VehicleGun): boolean {
  return gun.level >= gunTopStep()
}

function buyLabelOf(gun: VehicleGun): string {
  return isGunMounted(gun) ? 'Buy' : 'Mount'
}

function levelTextOf(gun: VehicleGun): string {
  if (!isGunMounted(gun)) return 'Mount'
  if (isGunAtTop(gun)) return `${majorOf(gun.level)} (top)`
  return `${stepLevelText(gun.level)} → ${stepLevelText(nextGunStep(gun))}`
}

function effectTextOf(gun: VehicleGun): string {
  if (!isGunMounted(gun)) return `${rateText(nextGunStep(gun))} shots/s`
  if (isGunAtTop(gun)) return `${rateText(gun.level)} shots/s`
  return `${rateText(gun.level)} → ${rateText(nextGunStep(gun))} shots/s`
}

function rateText(level: number): string {
  return String(Number(gunShotsPerSecond(level).toFixed(RATE_DECIMALS)))
}
