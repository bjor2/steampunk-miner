/**
 * The Sell bay screen (#37): "Sell, repair and recharge" with its exact total (highlighted on the
 * first visit, #16), the Hold row that opens the Hold tab of the base sheet (ticket 688), the refined batches once the platform has the Refinery bay (#105),
 * the visit's lining bill while there is one (#128) and the charging station, each on the shared
 * Title+OneLine element (spec #422, pass #427), in the shared scroll area. Markup only.
 */
import type { HoldRow, QuickServiceReading, SellBayModel } from '../../systems/views/sellBayModel'
import { UI_IDS } from '../ids'
import { ScrollArea } from '../kit/ScrollArea'
import { TitleOneLine } from '../kit/TitleOneLine'
import { ScreenButtonView } from '../ScreenButtonView'
import { BayFrame } from './BayFrame'
import { ChargingPanel } from './ChargingPanel'
import { LiningPanel } from './LiningPanel'
import styles from './Platform.module.css'
import { RefinedPanel } from './RefinedPanel'
import {
  HOLD_ROW_TEXT,
  holdRowFactsOf,
  quickServiceElementOf,
  quickServiceFactsOf,
} from './sellBayElements'

export function SellBayView({ model, focusedId }: { model: SellBayModel; focusedId: string }) {
  return (
    <BayFrame header={model.header} footer={model.footer} focusedId={focusedId}>
      <ScrollArea className={styles.panelsFrame}>
        <div className={styles.sellPanels} data-testid={UI_IDS.sellbayScreen}>
          <QuickServiceAction quickService={model.quickService} focusedId={focusedId} />
          <HoldAction hold={model.hold} focusedId={focusedId} />
          {model.refined === null ? null : (
            <RefinedPanel refined={model.refined} focusedId={focusedId} />
          )}
          {model.lining === null ? null : <LiningPanel lining={model.lining} />}
          <ChargingPanel charging={model.charging} focusedId={focusedId} />
        </div>
      </ScrollArea>
    </BayFrame>
  )
}

function HoldAction({ hold, focusedId }: { hold: HoldRow; focusedId: string }) {
  return (
    <TitleOneLine text={HOLD_ROW_TEXT} facts={holdRowFactsOf(hold)}>
      <span className={styles.action}>
        <ScreenButtonView button={hold.open} focusedId={focusedId} />
      </span>
    </TitleOneLine>
  )
}

function QuickServiceAction({
  quickService,
  focusedId,
}: {
  quickService: QuickServiceReading
  focusedId: string
}) {
  const element = quickServiceElementOf(quickService)
  return (
    <TitleOneLine
      text={element.text}
      iconId={quickService.card.iconId}
      facts={quickServiceFactsOf(quickService)}
      lockReason={element.lockReason}
    >
      <span className={styles.action}>
        <ScreenButtonView
          button={quickService.button}
          focusedId={focusedId}
          state={quickService.isHighlighted ? 'highlighted' : undefined}
        />
      </span>
    </TitleOneLine>
  )
}
