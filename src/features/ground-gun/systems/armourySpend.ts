/**
 * The one `armoury` row of the spend guard (#310 Systems point 2, the GD's rename of
 * `ground_weapon`; ticket 371): everything spent on weapons through the slices, read from the
 * `armoury` family tag. That is the bore gun's mount and tracks, each armoury lane's capability
 * nodes and modules, and their Marks. Registered as a kernel spend family (ticket 370), so the tech
 * tree reports it without importing this slice. The kernel turret's mount (`buyGun`) is a one-time
 * feature unlock: it stays in `kernel.buy_gun` and never counts here (GD ruling on #371).
 *
 * Anchored on `bore_gun` (P1), the armoury's first row, so no armoury buy happens before the
 * anchor is live. The row is report-only, as every family row is (GD Q4 on #212). Its gun-track
 * pin is gated: recurring gun-track spend (track levels, lane nodes, modules and Marks) stays at
 * or under `spendPin.maxShare` of each planet's spend (Vertical Scaler on #322). The bore gun's
 * mount is a one-time unlock too, so the pin leaves it out as it leaves out the turret's.
 */
import type { ShopSpend } from '../../../systems/bot/shopSpend'
import type { SpendFamily } from '../../../systems/registries/spendFamilies'
import { markOfNodeId } from '../../tech-tree'
import { AUTO_GUNS_MODULES } from './autoGunsLane'
import {
  ARMOURY_FAMILY,
  BORE_GUN_SCHEDULE_ROW,
  boreGunParts,
  MOUNT_PART_ID,
} from './boreGunContent'
import { BORE_GUN_MODULES } from './boreGunLane'
import { GROUND_GUN } from './groundGunEconomy'

/** Every authored module of both lanes, held ones too: a held module is never bought. */
const ARMOURY_MODULES = [...BORE_GUN_MODULES, ...AUTO_GUNS_MODULES]
const ARMOURY_ITEM_IDS: ReadonlySet<string> = new Set(ARMOURY_MODULES.map((each) => each.itemId))
const ARMOURY_BOUGHT_IDS: ReadonlySet<string> = new Set([
  ...boreGunParts()
    .filter((part) => part.familyId === ARMOURY_FAMILY)
    .map((part) => part.id),
  ...ARMOURY_MODULES.map((each) => each.node.id),
  ...ARMOURY_ITEM_IDS,
])

export const ARMOURY_SPEND_FAMILY: SpendFamily = {
  id: `ground-gun.${ARMOURY_FAMILY}`,
  anchorRowId: BORE_GUN_SCHEDULE_ROW,
  isMember: isArmourySpend,
  sharePin: { maxShare: GROUND_GUN.spendPin.maxShare, isPinned: isRecurringGunTrackSpend },
}

/** A node, Mark or item of an armoury lane, or a bore gun part, bought through a slice. */
function isArmourySpend(spend: ShopSpend): boolean {
  if (spend.source !== 'slice' || spend.boughtId === undefined) return false
  return ARMOURY_BOUGHT_IDS.has(spend.boughtId) || isArmouryMark(spend.boughtId)
}

/** An armoury buy other than the bore gun's one-time mount. */
function isRecurringGunTrackSpend(spend: ShopSpend): boolean {
  return isArmourySpend(spend) && spend.boughtId !== MOUNT_PART_ID
}

function isArmouryMark(boughtId: string): boolean {
  const mark = markOfNodeId(boughtId)
  return mark !== null && ARMOURY_ITEM_IDS.has(mark.itemId)
}
