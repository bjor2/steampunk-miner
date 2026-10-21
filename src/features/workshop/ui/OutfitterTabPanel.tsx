/**
 * The Outfitter tab's content (ticket 687): the kernel's Upgrade bay cards, each track's line
 * ending with the rig look step the player owns (`Fitting: …`, ticket 585, TD ruling on #579), as
 * the plaques named it before the bay moved onto the sheet, lit where the game's menu focus is.
 * Markup only.
 */
import { useGameStore } from '../../../store/gameStore'
import { readUpgradeBayModel } from '../../../store/screenReads'
import { focusOnScreen } from '../../../systems/views/menuFocus'
import { outfitterCardsOf } from '../../../systems/views/outfitterCards'
import { upgradeBayStartFocus } from '../../../systems/views/upgradeBayModel'
import type { WorkshopRow } from '../../../systems/views/workshopRows'
import { OutfitterPanelView } from '../../../ui/platform/OutfitterPanel'
import { useScreenModel } from '../../../ui/useScreenModel'
import { rigLookPlaqueFactOf } from '../../rig-look'

export function OutfitterTabPanel() {
  const model = useScreenModel(readUpgradeBayModel)
  const focusedControlId = useGameStore((state) => state.focusedControlId)
  const focusedId = focusOnScreen(model.focusStops, focusedControlId, upgradeBayStartFocus(model))
  return <OutfitterPanelView cards={outfitterCardsOf(model, fittingOf)} focusedId={focusedId} />
}

/** The owned rig look step; none below the first step or on a track without a template. */
function fittingOf(row: WorkshopRow): string | null {
  return rigLookPlaqueFactOf(row.upgradeId, row.level)
}
