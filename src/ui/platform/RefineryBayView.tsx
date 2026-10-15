/**
 * The Refinery bay screen (#105): the hold's ore by tier, each with Refine and what its batch
 * pays refined against raw, then the platform's slots and the next slot's price. Collecting is
 * the Sell bay's. Every row and the next slot's kernel item card are one shared Title+OneLine
 * element (spec #422, pass #427), in the shared scroll area. Markup only.
 */
import type {
  RefineryBayModel,
  RefineryOreRow,
  RefinerySlotReading,
} from '../../systems/views/refineryBayModel'
import { panelIconIdOf } from '../../systems/art/icons/iconSet'
import { Panel } from '../kit/Panel'
import { ScrollArea } from '../kit/ScrollArea'
import { TitleOneLine } from '../kit/TitleOneLine'
import { UI_ID_TEMPLATES, UI_IDS } from '../ids'
import { ScreenButtonView } from '../ScreenButtonView'
import { BayFrame } from './BayFrame'
import styles from './Platform.module.css'
import {
  BATCH_TEXT,
  batchFactsOf,
  oreRowFactsOf,
  oreRowTextOf,
  REFINERY_HOLD_HEADING,
  REFINERY_SLOTS_HEADING,
  slotBuyElementOf,
  slotBuyFactsOf,
  slotTextOf,
} from './refineryBayElements'

export function RefineryBayView({
  model,
  focusedId,
}: {
  model: RefineryBayModel
  focusedId: string
}) {
  return (
    <BayFrame header={model.header} footer={model.footer} focusedId={focusedId}>
      <ScrollArea className={styles.panelsFrame}>
        <div className={styles.refineryPanels} data-testid={UI_IDS.refinerybayScreen}>
          <Panel title="Hold" iconId={panelIconIdOf('hold')} heading={REFINERY_HOLD_HEADING}>
            {model.ore.map((row) => (
              <OreRowView key={row.tier} row={row} focusedId={focusedId} />
            ))}
            <div className={styles.row}>
              <TitleOneLine text={BATCH_TEXT} facts={batchFactsOf(model)} level="span" />
            </div>
          </Panel>
          <Panel title="Slots" iconId={panelIconIdOf('slots')} heading={REFINERY_SLOTS_HEADING}>
            {model.slots.map((slot) => (
              <SlotView key={slot.index} slot={slot} />
            ))}
            <NextSlot model={model} focusedId={focusedId} />
          </Panel>
        </div>
      </ScrollArea>
    </BayFrame>
  )
}

function OreRowView({ row, focusedId }: { row: RefineryOreRow; focusedId: string }) {
  return (
    <div
      className={styles.row}
      data-testid={UI_ID_TEMPLATES.refinerybayOre(row.tier)}
      data-tier={row.tier}
    >
      <TitleOneLine text={oreRowTextOf(row)} facts={oreRowFactsOf(row)} level="span">
        <ScreenButtonView button={row.queue} focusedId={focusedId} />
      </TitleOneLine>
    </div>
  )
}

function SlotView({ slot }: { slot: RefinerySlotReading }) {
  return (
    <div
      className={styles.row}
      data-testid={UI_ID_TEMPLATES.refinerybaySlot(slot.index)}
      data-look={slot.look}
      data-yours={slot.isYours}
    >
      <TitleOneLine text={slotTextOf(slot)} iconId={slot.iconId} level="span" />
    </div>
  )
}

/** The next slot's card, its price kept on the element beside Buy slot (K7 #199). */
function NextSlot({ model, focusedId }: { model: RefineryBayModel; focusedId: string }) {
  const element = slotBuyElementOf(model)
  return (
    <TitleOneLine
      text={element.text}
      iconId={model.slotCard.iconId}
      facts={slotBuyFactsOf(model)}
      lockReason={element.lockReason}
    >
      <ScreenButtonView button={model.buySlot} focusedId={focusedId} />
    </TitleOneLine>
  )
}
