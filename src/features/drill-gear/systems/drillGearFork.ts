/**
 * The drill-gear lane's fork, priced on P16 (GD lock on #255, build 3, ticket 268): two exclusive
 * branches, `tech.drill_gear.fork.wide` and `.deep`, picked with `tech-tree.choose_fork` and
 * acting while active, on the kernel's drill gear read. Both are tree-only capabilities: no store
 * item, no slot.
 *
 * - **Wide** (gallery reamers): the flanks are the main cut. While active it adds one level to the
 *   kernel's one bore width (GD lock on #662 Part B, ticket 749, `boreWidthLevels.ts`): the body
 *   and its stamp a metre wider, on top of the side cutters' width Marks, and it asks the drill for
 *   no flank cell of its own. Each width cell pays its whole dig energy, so the width costs energy,
 *   never time. No planet gates it: the fork and the `side_drills` row it leans on are price
 *   anchors only, so a game short of P13 that chose Wide cuts its flanks (GD lock on #308, ticket
 *   624).
 * - **Deep** (plunge crown): the bit commits downward. Facing down, every cut also takes the cell
 *   past the bit along the facing, inside the kernel's `aheadCellsMax` of 1, which the slice's
 *   economy file is refused past. It never cuts a flank cell. It is the pacing bot's pick: the bot
 *   bores straight down, and its scripted bore cuts with the gear (GD ruling on #392).
 *
 * The cards name neither the leaned row nor its item, and no ore family (the #255 guard). Both read
 * as one-off sidegrades, and Wide gives its bore width and ore gain (ticket 621, `boreWidthCopy`).
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import type { DrillGearAsk } from '../../../systems/economy/drillGearCaps'
import type { DrillGearSource } from '../../../systems/registries/drillGear'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { activeForkBranchOf, forkPairOf, type ForkPair, type TechLane } from '../../tech-tree'
import { plungeCrownNotes } from './aheadCutNotes'
import { SIDEGRADE_NOTE, wideBranchNotesOf } from './boreWidthCopy'
import { DRILL_GEAR_ECONOMY, type DrillGearStatName } from './drillGearEconomy'
import { widestWidthMark } from './sideCutterMarks'

const LANE: TechLane = 'drill-gear'

export const WIDE_BRANCH = 'wide'
/** The width levels Wide's reamers add while the branch is active (#662 Q2: "+1 with Wide"). */
export const WIDE_WIDTH_LEVELS = 1
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
    description: 'Fluted reamers on the flanks carve a broad gallery as you go.',
    label: 'horizontal',
    cardNotes: wideBranchNotesOf(WIDE_WIDTH_LEVELS, widestWidthMark()),
  },
  {
    branch: DEEP_BRANCH,
    name: 'Plunge crown',
    iconId: 'icon-hud-depth',
    prereqs: [],
    unlocks: PLUNGE_CROWN_ID,
    description: 'A hardened crown bites the next cell down before the bit arrives.',
    label: 'horizontal',
    cardNotes: [...plungeCrownNotes(), SIDEGRADE_NOTE],
    isPacingBotPick: true,
  },
])

export const DRILL_GEAR_FORK_SOURCE: DrillGearSource = {
  id: 'drill-gear.fork',
  gearOf: (state, playerId) => forkAskOf(state, playerId),
}

type BranchAsk = (state: AuthorityState, playerId: string) => DrillGearAsk | null

/** Wide widens the bore through the kernel's width (`boreWidthLevels.ts`), never a gear ask. */
const BRANCH_ASKS: Readonly<Record<string, BranchAsk>> = {
  [DEEP_BRANCH]: deepAskOf,
}

/** What the lane's active branch asks of the drill now; null before the lane chooses. */
function forkAskOf(state: AuthorityState, playerId: string): DrillGearAsk | null {
  const branch = activeForkBranchOf(state, playerId, LANE)
  return branch === null ? null : (BRANCH_ASKS[branch]?.(state, playerId) ?? null)
}

function deepAskOf(state: AuthorityState, playerId: string): DrillGearAsk | null {
  const pose = vehicleOf(state, playerId).pose
  if (pose?.facing !== FACING.down) return null
  return { aheadCells: forkValueOf(PLUNGE_CROWN_ID, 'aheadCells') }
}

/** One number of a branch's `items.balance` row; a missing one is a broken file. */
export function forkValueOf(itemId: string, stat: DrillGearStatName): number {
  const value = DRILL_GEAR_ECONOMY.balance[itemId]?.[stat]
  if (value === undefined) throw new RangeError(`items.balance.${itemId} has no ${stat}`)
  return value
}
