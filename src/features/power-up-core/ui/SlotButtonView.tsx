/**
 * One slot button (#162 section 2.3, G&V feel pass A4): a 56 px round target with the item's
 * 32 px glyph, a pip per charge around the rim and a sweeping cooldown ring, readable in
 * grayscale (#158). While the item's hold runs, a ring outside the rim fills with it and snaps
 * back when the hold ends (G&V on #204, ticket 253). A tap uses the slot; a hold shows the item's
 * card instead, with the item's sibling-link switch once its Mark reached one (ticket 274). When a
 * link fires this item, its tile flashes as its cooldown ring starts.
 */
import type { CSSProperties } from 'react'
import { ItemCard } from '../../../ui/kit/ItemCard'
import { VectorIcon } from '../../../ui/VectorIcon'
import { Button } from '../../../ui/kit/Button'
import type { SlotButton, SlotLink } from '../systems/slotColumn'
import styles from './SlotColumn.module.css'
import { readSlotCard } from '../store/slotColumnReads'
import { toggleSiblingLink } from '../store/siblingLinkActions'
import { useSlotHold, type SlotHold } from './useSlotHold'

export function SlotButtonView({ button }: { button: SlotButton }) {
  const hold = useSlotHold(button)
  const rings = {
    '--cooldown': `${button.cooldownPercent}%`,
    '--hold': `${button.holdPercent}%`,
  } as CSSProperties
  return (
    <div className={styles.slot}>
      {/* Touch only: the keyboard has Digit1-5 themselves, so Tab never stops here. */}
      <button
        type="button"
        className={styles.button}
        style={rings}
        data-testid={`power-up-slot-${button.slot}`}
        data-acting={button.isActing || undefined}
        data-on={button.isOn || undefined}
        data-cooling={button.cooldownPercent > 0 || undefined}
        data-holding={button.holdPercent > 0 || undefined}
        data-link-flash={button.isLinkFlashing || undefined}
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
      {hold.isCardShown && <SlotCard button={button} hold={hold} />}
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

/** Pinned open after the release, any tap on the card closes it; its switch flips first. */
function SlotCard({ button, hold }: { button: SlotButton; hold: SlotHold }) {
  return (
    <div
      className={styles.card}
      data-testid="power-up-slot-card"
      data-pinned={hold.isCardPinned || undefined}
      onClick={hold.closeCard}
    >
      <ItemCard variant="full" card={readSlotCard(button)}>
        <span className={styles.cardName}>{button.name}</span>
      </ItemCard>
      {button.link !== null && <LinkSwitch itemId={button.itemId} link={button.link} />}
    </div>
  )
}

function LinkSwitch({ itemId, link }: { itemId: string; link: SlotLink }) {
  return (
    <span
      className={styles.linkSwitch}
      data-testid="power-up-slot-link-switch"
      data-on={link.isOn || undefined}
    >
      <Button label={linkSwitchLabelOf(link)} onPress={() => toggleSiblingLink(itemId)} />
    </span>
  )
}

function linkSwitchLabelOf({ siblingName, isOn }: SlotLink): string {
  return `Link to ${siblingName}: ${isOn ? 'on' : 'off'}`
}
