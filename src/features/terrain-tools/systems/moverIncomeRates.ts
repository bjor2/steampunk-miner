/**
 * The movers' rates for the kernel's 15% income-cap check (#385; GD ruling on #212 Q2 (a), TD lock
 * "K-ir"): the ore-shifter, the pressure pocket lance and the lodestone beacon count the value of
 * the ore cells they relocate in a minute at their last Mark, every charge spent, each cell the
 * band's richest ore (+2 lead, #140) and no more cells than the hold takes: an upper bound on what
 * reaches the hold. The kernel clamps each trip to `tripCapAt`, but play pays no mover through the
 * trip ledger yet, so a mover over the cap before the clamp is known-red in the check until the
 * ledger blocker of ruling 6167240683 lands (`tech.incomeCap.knownRed`). The seam splitter opens
 * plain ground only and moves no ore, so it has no rate.
 *
 * A use moves no more ore than its item's size and the TD's unit cap allow (`editDraft.ts`): the
 * shifter drags `magnitude` nodules at a move each, the lance pushes the ore of its disc out at a
 * move and an open each, and a beacon gathers at most its swap cap in moves, once a dock, one live
 * a planet: at most one gather a minute. Each mover is a tree item no `stats.json` row admits, so
 * it anchors on itself and counts once owned.
 *
 * A mover whose last Mark reaches its sibling-link (#256, ticket 278) also says what the link
 * relocates a minute, for `balance:tree --milestones`: the ore-shifter's plants a lodestone beacon
 * gathering half its swap cap, at most one gather a minute as the beacon's own; the pocket lance's
 * opens a seam splitter fissure, which moves no ore.
 */
import { TICKS_PER_SECOND } from '../../../constants/physics'
import { oreTier, oreValue } from '../../../systems/economy/oreEconomy'
import { fromSafeInteger, mul, type Money } from '../../../systems/money'
import type { IncomeAt, IncomeRate } from '../../../systems/registries/incomeRates'
import { atLinkStrength } from '../../power-up-core'
import { lastMarkOf, markStepOf, type MarkStep } from '../../tech-tree'
import { ACTIVATION_UNIT_CAP, MOVE_UNITS, OPEN_UNITS } from './editDraft'
import { tilesNearestFirst } from './editGeometry'
import { magnitudeAt, terrainItemNamed } from './itemMagnitude'
import { LODESTONE_BEACON_ID } from './lodestoneBeacon'
import { ORE_SHIFTER_ID } from './oreShifter'
import { PRESSURE_POCKET_ID } from './pressurePocket'
import { balanceOf, markLadderOf, type TerrainItem } from './terrainItems'

const MINUTE_TICKS = 60 * TICKS_PER_SECOND
/** The richest cells a band holds: its ore with the +2 lead (#140). */
const RICHEST_LEAD = 2
const POCKET_CENTRE = { tx: 0, ty: 0 }

/** A mover at its last Mark: the most ore cells one use relocates and its most uses a minute. */
export interface MoverAtFullStack {
  oreCellsPerUse: number
  usesPerMinute: number
}

const NO_ORE_MOVED: MoverAtFullStack = { oreCellsPerUse: 0, usesPerMinute: 0 }

export const MOVER_INCOME_RATES: readonly IncomeRate[] = [
  linkedMoverRateOf(ORE_SHIFTER_ID, shifterAtFullStack, linkedBeaconAtFullStack),
  linkedMoverRateOf(PRESSURE_POCKET_ID, pocketAtFullStack, () => NO_ORE_MOVED),
  moverRateOf(LODESTONE_BEACON_ID, beaconAtFullStack),
]

/** The ore value a minute of the mover relocates on the band, at most a hold of it. */
export function relocatedValuePerMinute(mover: MoverAtFullStack, at: IncomeAt): Money {
  const cells = Math.min(mover.oreCellsPerUse * mover.usesPerMinute, at.cargoCapacity)
  return mul(fromSafeInteger(cells), oreValue(oreTier(at.planetIndex, at.band) + RICHEST_LEAD))
}

export function shifterAtFullStack(): MoverAtFullStack {
  const item = terrainItemNamed(ORE_SHIFTER_ID)
  const nodules = magnitudeAt(item, lastMarkOf(markLadderOf(item)))
  return {
    oreCellsPerUse: Math.min(nodules, Math.floor(ACTIVATION_UNIT_CAP / MOVE_UNITS)),
    usesPerMinute: chargedUsesPerMinute(lastStepOf(item)),
  }
}

export function pocketAtFullStack(): MoverAtFullStack {
  const item = terrainItemNamed(PRESSURE_POCKET_ID)
  const radius = magnitudeAt(item, lastMarkOf(markLadderOf(item)))
  const discTiles = tilesNearestFirst(POCKET_CENTRE, radius, 0).length
  return {
    oreCellsPerUse: Math.min(
      discTiles,
      Math.floor(ACTIVATION_UNIT_CAP / (MOVE_UNITS + OPEN_UNITS)),
    ),
    usesPerMinute: chargedUsesPerMinute(lastStepOf(item)),
  }
}

export function beaconAtFullStack(): MoverAtFullStack {
  return gatherOf(beaconSwapCap())
}

/** A beacon a shifter's link plants: half its swap cap, gathered at a dock like its own. */
export function linkedBeaconAtFullStack(): MoverAtFullStack {
  return gatherOf(atLinkStrength(beaconSwapCap()))
}

function beaconSwapCap(): number {
  return balanceOf(terrainItemNamed(LODESTONE_BEACON_ID)).swapCap ?? 0
}

function gatherOf(swapCap: number): MoverAtFullStack {
  return { oreCellsPerUse: Math.floor(swapCap / MOVE_UNITS), usesPerMinute: 1 }
}

function moverRateOf(itemId: string, atFullStack: () => MoverAtFullStack): IncomeRate {
  return {
    id: `terrain-tools.${itemId.split('.')[1]}`,
    itemId,
    anchorRowId: itemId,
    isTripCappedInPlay: false,
    valuePerMinuteAtFullStack: (at) => relocatedValuePerMinute(atFullStack(), at),
  }
}

/** A mover whose last Mark reaches its sibling-link, with what the link relocates. */
function linkedMoverRateOf(
  itemId: string,
  atFullStack: () => MoverAtFullStack,
  linkedAtFullStack: () => MoverAtFullStack,
): IncomeRate {
  return {
    ...moverRateOf(itemId, atFullStack),
    linkValuePerMinuteAtFullStack: (at) => relocatedValuePerMinute(linkedAtFullStack(), at),
  }
}

function lastStepOf(item: TerrainItem): MarkStep {
  const ladder = markLadderOf(item)
  return markStepOf(ladder, lastMarkOf(ladder))
}

/** Every charge, then one a cooldown: as the drain's minute counts them (TD lock "K-ir"). */
function chargedUsesPerMinute({ stats }: MarkStep): number {
  const charges = stats.charges as number
  const cooldown = stats.cooldown as number
  return Math.min(charges, 1 + Math.floor(MINUTE_TICKS / cooldown))
}
