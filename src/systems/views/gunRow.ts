/**
 * The Upgrade bay's Guns row (#107 design): shown once `auto_guns` is unlocked on this planet or
 * the guns are already bolted on, and nothing before (#90 vision stub rule). Before the mount the
 * row offers the mount; after it, the next level of the gun track with its rate "now -> next";
 * at the cap it says so and its Buy carries `max_level`.
 */
import type { AuthorityState } from '../authority/authorityState'
import { gunOf, isGunOffered, nextGunPriceOf } from '../authority/gunRules'
import { GUN_ICON_ID } from '../art/artIds'
import { gunMaxLevel, gunShotsPerSecond } from '../economy/gunStats'
import { buyGunCommand } from '../platform/platformCommands'
import { isGunMounted, type VehicleGun } from '../vehicle/vehicleGun'
import { UI_IDS } from './screenIds'
import { amountReading, commandButton, type AmountReading, type ScreenButton } from './viewParts'
import { buyStateOf, type BuyState } from './workshopRows'

export interface GunRow {
  iconId: string
  label: string
  level: number
  /** "Mount", "1 → 2" or "16 (top)". */
  levelText: string
  /** The fire rate the buy gives: "2 shots/s", or "2 → 2.07 shots/s". */
  effectText: string
  cost: AmountReading
  buy: ScreenButton
  buyState: BuyState
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
    buyGunCommand(),
  )
  return {
    iconId: GUN_ICON_ID,
    label: 'Guns',
    level: gun.level,
    levelText: levelTextOf(gun),
    effectText: effectTextOf(gun),
    cost: amountReading(nextGunPriceOf(state, playerId)),
    buy,
    buyState: buyStateOf(buy),
  }
}

function buyLabelOf(gun: VehicleGun): string {
  return isGunMounted(gun) ? 'Buy' : 'Mount'
}

function levelTextOf(gun: VehicleGun): string {
  if (!isGunMounted(gun)) return 'Mount'
  if (gun.level >= gunMaxLevel()) return `${gun.level} (top)`
  return `${gun.level} → ${gun.level + 1}`
}

function effectTextOf(gun: VehicleGun): string {
  if (!isGunMounted(gun)) return `${rateText(gun.level + 1)} shots/s`
  if (gun.level >= gunMaxLevel()) return `${rateText(gun.level)} shots/s`
  return `${rateText(gun.level)} → ${rateText(gun.level + 1)} shots/s`
}

function rateText(level: number): string {
  return String(Number(gunShotsPerSecond(level).toFixed(RATE_DECIMALS)))
}
