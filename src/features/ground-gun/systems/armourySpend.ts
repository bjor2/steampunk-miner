/**
 * The one `armoury` row of the spend guard (#310 Systems point 2, the GD's rename of
 * `ground_weapon`; ticket 371): everything spent on weapons, read from the `armoury` family tag.
 * That is the brass of both guns (the bore gun's mount and tracks, the kernel turret's `buyGun`),
 * each armoury lane's capability nodes and modules, and their Marks. Registered as a kernel spend
 * family (ticket 370), so the tech tree reports it without importing this slice. It sorts before
 * `kernel.buy_gun`, so a turret buy is filed here once this slice loads and never counted twice.
 *
 * Anchored on `bore_gun` (P1), the armoury's first row: the turret's `auto_guns` (P4) opens later,
 * so no armoury buy happens before the anchor is live. Report-only, as every family row is (GD Q4
 * on #212); the turret buy also counts in the gated tree total (TD, GD accepted 14 Oct).
 */
import type { ShopSpend } from '../../../systems/bot/shopSpend'
import { BUY_GUN_SPEND_FAMILY, type SpendFamily } from '../../../systems/registries/spendFamilies'
import { markOfNodeId } from '../../tech-tree'
import { AUTO_GUNS_MODULES } from './autoGunsLane'
import { ARMOURY_FAMILY, BORE_GUN_SCHEDULE_ROW, boreGunParts } from './boreGunContent'
import { BORE_GUN_MODULES } from './boreGunLane'

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
}

function isArmourySpend(spend: ShopSpend): boolean {
  return BUY_GUN_SPEND_FAMILY.isMember(spend) || isArmourySliceBuy(spend)
}

/** A node, Mark or item of an armoury lane, or a bore gun part, bought through a slice. */
function isArmourySliceBuy(spend: ShopSpend): boolean {
  if (spend.source !== 'slice' || spend.boughtId === undefined) return false
  return ARMOURY_BOUGHT_IDS.has(spend.boughtId) || isArmouryMark(spend.boughtId)
}

function isArmouryMark(boughtId: string): boolean {
  const mark = markOfNodeId(boughtId)
  return mark !== null && ARMOURY_ITEM_IDS.has(mark.itemId)
}
