/**
 * The bay's service corner on the shared Title+OneLine element (spec #422, pass #425): Repair's
 * card text (its name, what it restores, the flavour in the tooltip), and the hull, the repair
 * price and the look tier as glyph-and-value facts on the kernel's #33 ids.
 */
import { gaugeIconIdOf, PREVIEW_TIER_ICON_ID } from '../../../systems/art/icons/iconSet'
import { itemCardElementOf, type ItemCardElement } from '../../../systems/views/itemCardElement'
import type { UpgradeBayModel } from '../../../systems/views/upgradeBayModel'
import { UI_IDS } from '../../../ui/ids'
import type { IconValue } from '../../../ui/kit/TitleOneLine'

export function serviceElementOf(model: UpgradeBayModel): ItemCardElement {
  return itemCardElementOf('upgrade-bay.service', model.repair.card)
}

export function serviceFactsOf(model: UpgradeBayModel): IconValue[] {
  const { repair } = model
  return [
    { iconId: gaugeIconIdOf('hull'), text: repair.hullText, testId: UI_IDS.workshopHull },
    {
      iconId: model.header.moneyIconId,
      text: repair.cost.text,
      exact: repair.cost.exact,
      holds: 'price',
      testId: UI_IDS.workshopRepairCost,
    },
    {
      iconId: PREVIEW_TIER_ICON_ID,
      text: String(model.visualTier),
      testId: UI_IDS.workshopVisualTier,
    },
  ]
}
