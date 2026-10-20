/**
 * The drill-gear lane's fork, priced on P16 (GD lock on #255, build 3, ticket 268): two exclusive
 * branches, `tech.drill_gear.fork.wide` and `.deep`, picked with `tech-tree.choose_fork` and
 * acting while active, on the kernel's drill gear read. Both are tree-only capabilities: no store
 * item, no slot.
 *
 * - **Wide** (gallery reamers): the flanks are the main cut. Every cut also takes the reamers' cells
 *   on each flank of the bore, and with the side cutters switched on, their cells plus the
 *   reamers', on the side their hold faces when held. Each flank cell pays the whole-share floor
 *   (`drillGearCaps`), so the width costs energy, never time. No planet gates it: the fork
 *   and the `side_drills` row it leans on are price anchors only, so a game short of P13 that
 *   chose Wide cuts its flanks (GD lock on #308, ticket 624).
 * - **Deep** (plunge crown): the bit commits downward. Facing down, every cut also takes the cell
 *   past the bit along the facing, inside the kernel's `aheadCellsMax` of 1, which the slice's
 *   economy file is refused past. It never cuts a flank cell. It is the pacing bot's pick: the bot
 *   bores straight down, and its scripted bore cuts with the gear (GD ruling on #392).
 *
 * The cards name neither the leaned row nor its item, and no ore family (the #255 guard).
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import type { DrillGearAsk } from '../../../systems/economy/drillGearCaps'
import type { DrillGearSource } from '../../../systems/registries/drillGear'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { isToggleEngaged } from '../../power-up-core'
import { activeForkBranchOf, forkPairOf, type ForkPair, type TechLane } from '../../tech-tree'
import { plungeCrownNotes } from './aheadCutNotes'
import { drillGearAskOf, SIDE_CUTTERS_ID } from './cuttersAndBoom'
import { facedHoldOf } from './cuttersHold'
import { DRILL_GEAR_ECONOMY, type DrillGearStatName } from './drillGearEconomy'

const LANE: TechLane = 'drill-gear'

export const WIDE_BRANCH = 'wide'
export const DEEP_BRANCH = 'deep'
export const GALLERY_REAMERS_ID = 'gear.gallery_reamers'
export const PLUNGE_CROWN_ID = 'gear.plunge_crown'

/** The scheduled row Wide leans on (#255 lock: "Wide on `side_drills`"). */
export const WIDE_LEANED_ROW = 'side_drills'

export const DRILL_GEAR_FORK: ForkPair = forkPairOf(LANE, [
  {
    branch: WIDE_BRANCH,
    name: 'Gallery reamers',
    iconId: 'icon-track-drill-power',
    prereqs: [],
    unlocks: GALLERY_REAMERS_ID,
    description: 'Fluted reamers ride the flanks and carve a broad gallery as you go.',
    label: 'horizontal',
  },
  {
    branch: DEEP_BRANCH,
    name: 'Plunge crown',
    iconId: 'icon-hud-depth',
    prereqs: [],
    unlocks: PLUNGE_CROWN_ID,
    description: 'A hardened crown bites the next cell down before the bit arrives.',
    label: 'horizontal',
    cardNotes: plungeCrownNotes(),
    isPacingBotPick: true,
  },
])

export const DRILL_GEAR_FORK_SOURCE: DrillGearSource = {
  id: 'drill-gear.fork',
  gearOf: (state, playerId) => forkAskOf(state, playerId),
}

type BranchAsk = (state: AuthorityState, playerId: string) => DrillGearAsk | null

const BRANCH_ASKS: Readonly<Record<string, BranchAsk>> = {
  [WIDE_BRANCH]: wideAskOf,
  [DEEP_BRANCH]: deepAskOf,
}

/** What the lane's active branch asks of the drill now; null before the lane chooses. */
function forkAskOf(state: AuthorityState, playerId: string): DrillGearAsk | null {
  const branch = activeForkBranchOf(state, playerId, LANE)
  return branch === null ? null : (BRANCH_ASKS[branch]?.(state, playerId) ?? null)
}

function wideAskOf(state: AuthorityState, playerId: string): DrillGearAsk {
  return widenedFlanksOf(engagedCuttersAskOf(state, playerId))
}

/**
 * The reamers' flank cells on top of the side cutters' ask (null while they are off), keeping
 * the cutters' hold aim: the kernel takes the largest side ask, never a sum, so Wide states the sum.
 */
export function widenedFlanksOf(cutters: DrillGearAsk | null): DrillGearAsk {
  const reamerCells = forkValueOf(GALLERY_REAMERS_ID, 'sideCells')
  const reamerShareBp = forkValueOf(GALLERY_REAMERS_ID, 'sideEnergyShareBp')
  return {
    ...cutters,
    sideCells: (cutters?.sideCells ?? 0) + reamerCells,
    sideEnergyShareBp: Math.max(cutters?.sideEnergyShareBp ?? 0, reamerShareBp),
  }
}

function deepAskOf(state: AuthorityState, playerId: string): DrillGearAsk | null {
  const pose = vehicleOf(state, playerId).pose
  if (pose?.facing !== FACING.down) return null
  return { aheadCells: forkValueOf(PLUNGE_CROWN_ID, 'aheadCells') }
}

/** The side cutters' own ask while switched on, held aim included; null while off. */
function engagedCuttersAskOf(state: AuthorityState, playerId: string): DrillGearAsk | null {
  const isCutterEngaged = (itemId: string) =>
    itemId === SIDE_CUTTERS_ID && isToggleEngaged(state, playerId, itemId)
  return drillGearAskOf(isCutterEngaged, facedHoldOf(state, playerId, SIDE_CUTTERS_ID))
}

/** One number of a branch's `items.balance` row; a missing one is a broken file. */
export function forkValueOf(itemId: string, stat: DrillGearStatName): number {
  const value = DRILL_GEAR_ECONOMY.balance[itemId]?.[stat]
  if (value === undefined) throw new RangeError(`items.balance.${itemId} has no ${stat}`)
  return value
}
