/**
 * One slot button (#162 section 2.3, G&V feel pass A4): a 56 px round target with the item's
 * 32 px glyph, a pip per charge around the rim and a sweeping cooldown ring, readable in
 * grayscale (#158). A tap uses the slot; a hold shows the item's card instead.
 */
import type { CSSProperties } from 'react'
import { ItemCard } from '../../../ui/kit/ItemCard'
import { VectorIcon } from '../../../ui/VectorIcon'
import type { SlotButton } from '../systems/slotColumn'
import styles from './SlotColumn.module.css'
import { readSlotCard } from '../store/slotColumnReads'
import { useSlotHold } from './useSlotHold'

export function SlotButtonView({ button }: { button: SlotButton }) {
  const hold = useSlotHold(button.action)
  const ring = { '--cooldown': `${button.cooldownPercent}%` } as CSSProperties
  return (
    <div className={styles.slot}>
      {/* Touch only: the keyboard has Digit1-5 themselves, so Tab never stops here. */}
      <button
        type="button"
        className={styles.button}
        style={ring}
        data-testid={`power-up-slot-${button.slot}`}
        data-acting={button.isActing || undefined}
        data-on={button.isOn || undefined}
        data-cooling={button.cooldownPercent > 0 || undefined}
        aria-label={button.name}
        tabIndex={-1}
        onPointerDown={hold.press}
        onPointerUp={hold.release}
        onPointerCancel={hold.cancel}
        onPointerLeave={hold.cancel}
      >
        <VectorIcon iconId={button.iconId} size="menu" />
        <ChargePips left={button.chargesLeft} max={button.chargesMax} />
      </button>
      {hold.isCardShown && <SlotCard button={button} />}
    </div>
  )
}

function ChargePips({ left, max }: { left: number; max: number }) {
  return (
    <span className={styles.pips} aria-hidden>
      {Array.from({ length: max }, (_, index) => (
        <span key={index} className={styles.pip} data-spent={index >= left || undefined} />
      ))}
    </span>
  )
}

function SlotCard({ button }: { button: SlotButton }) {
  return (
    <div className={styles.card} data-testid="power-up-slot-card">
      <ItemCard variant="full" card={readSlotCard(button)}>
        <span className={styles.cardName}>{button.name}</span>
      </ItemCard>
    </div>
  )
}
