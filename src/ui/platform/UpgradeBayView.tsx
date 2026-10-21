/**
 * The Upgrade bay in the kernel's own bay frame (#37), drawn only while no slice registers the bay's
 * screen (`bayScreens`, ticket 227: "empty means today"): the header, the Outfitter's cards (ticket
 * 687) in the shared scroll area, and the footer. With the workshop slice loaded the cards are on
 * the base sheet instead. Markup only.
 */
import { outfitterCardsOf } from '../../systems/views/outfitterCards'
import type { UpgradeBayModel } from '../../systems/views/upgradeBayModel'
import { UI_IDS } from '../ids'
import { ScrollArea } from '../kit/ScrollArea'
import { BayFrame } from './BayFrame'
import { OutfitterPanelView } from './OutfitterPanel'
import styles from './Platform.module.css'

export function UpgradeBayView({
  model,
  focusedId,
}: {
  model: UpgradeBayModel
  focusedId: string
}) {
  return (
    <BayFrame header={model.header} footer={model.footer} focusedId={focusedId}>
      <ScrollArea className={styles.tracksFrame} testId={UI_IDS.upgradebayScreen}>
        <OutfitterPanelView cards={outfitterCardsOf(model)} focusedId={focusedId} />
      </ScrollArea>
    </BayFrame>
  )
}
