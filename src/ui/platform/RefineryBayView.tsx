/**
 * The Refinery bay screen (#105): the hold's ore by tier, each with Refine and what its batch
 * pays refined against raw, then the platform's slots and the next slot's price. Collecting is
 * the Sell bay's. The next slot is the kernel item card's platform card once a describer answers
 * (K7 #199). Markup only.
 */
import type {
  RefineryBayModel,
  RefineryOreRow,
  RefinerySlotReading,
} from '../../systems/views/refineryBayModel'
import { panelIconIdOf } from '../../systems/art/icons/iconSet'
import { ItemCard } from '../kit/ItemCard'
import { Panel } from '../kit/Panel'
import { UI_ID_TEMPLATES, UI_IDS } from '../ids'
import { ScreenButtonView } from '../ScreenButtonView'
import { VectorIcon } from '../VectorIcon'
import { BayFrame } from './BayFrame'
import { Field } from './BayHeader'
import styles from './Platform.module.css'

export function RefineryBayView({
  model,
  focusedId,
}: {
  model: RefineryBayModel
  focusedId: string
}) {
  return (
    <BayFrame header={model.header} footer={model.footer} focusedId={focusedId}>
      <div className={styles.refineryPanels} data-testid={UI_IDS.refinerybayScreen}>
        <Panel title="Hold" iconId={panelIconIdOf('hold')}>
          {model.ore.map((row) => (
            <OreRowView key={row.tier} row={row} focusedId={focusedId} />
          ))}
          <Field label="Batch">
            <span data-testid={UI_IDS.refinerybayBatchCap}>{model.batchCapText}</span>
          </Field>
        </Panel>
        <Panel title="Slots" iconId={panelIconIdOf('slots')}>
          {model.slots.map((slot) => (
            <SlotView key={slot.index} slot={slot} />
          ))}
          <ItemCard
            variant="full"
            card={model.slotCard}
            action={<ScreenButtonView button={model.buySlot} focusedId={focusedId} />}
          >
            <div className={styles.action}>
              <ScreenButtonView button={model.buySlot} focusedId={focusedId} />
              <span
                data-testid={UI_IDS.refinerybaySlotPrice}
                data-exact={model.slotPrice?.exact ?? ''}
              >
                {model.slotPrice?.text ?? 'All slots built'}
              </span>
            </div>
          </ItemCard>
        </Panel>
      </div>
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
      <VectorIcon iconId={row.iconId} size="menu" />
      <span className={styles.tier}>T{row.tier}</span>
      <span>{row.held} held</span>
      <span data-exact={row.raw.exact}>raw {row.raw.text}</span>
      <span data-exact={row.refined.exact}>refined {row.refined.text}</span>
      <ScreenButtonView button={row.queue} focusedId={focusedId} />
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
      <VectorIcon iconId={slot.iconId} size="menu" />
      <span className={styles.tier}>#{slot.index + 1}</span>
      <span>{slot.text}</span>
    </div>
  )
}
