/**
 * One slot's cell on the tool slot bar (#162 section 2.3, G&V feel pass A4; the bar since ticket
 * 691): the kernel's cell with the item's glyph, its cooldown ring and its charges badge. While
 * the item's hold runs, a ring around the cell fills with it and snaps back when the hold ends
 * (G&V on #204, ticket 253). A tap uses the slot; a hold shows the item's card instead, with the
 * item's sibling-link switch once its Mark reached one (ticket 274). When a link fires this item,
 * its cell flashes as its cooldown ring starts.
 */
import type { CSSProperties } from 'react'
import type { ToolCellProps } from '../../../ui/registries/toolSlots'
import { ItemCard } from '../../../ui/kit/ItemCard'
import { Button } from '../../../ui/kit/Button'
import { ToolCell } from '../../../ui/toolSlots/ToolCell'
import type { SlotButton, SlotLink } from '../systems/slotColumn'
import styles from './SlotToolCell.module.css'
import { readSlotCard } from '../store/slotColumnReads'
import { toggleSiblingLink } from '../store/siblingLinkActions'
import { useSlotHold, type SlotHold } from './useSlotHold'

export function SlotToolCell({ face: button }: ToolCellProps<SlotButton>) {
  const hold = useSlotHold(button)
  return (
    <ToolCell
      face={button}
      testId={`power-up-slot-${button.slot}`}
      pointer={{
        onPointerDown: hold.press,
        onPointerUp: hold.release,
        onPointerCancel: hold.cancel,
        onPointerLeave: hold.cancel,
      }}
    >
      {button.holdPercent > 0 && <HoldRing percent={button.holdPercent} />}
      {button.isLinkFlashing && <span className={styles.linkFlash} data-link-flash />}
      {hold.isCardShown && <SlotCard button={button} hold={hold} />}
    </ToolCell>
  )
}

/** The hold ring fills clockwise with the share already held; no transition, so a cancel snaps. */
function HoldRing({ percent }: { percent: number }) {
  const ring = { '--hold': `${percent}%` } as CSSProperties
  return <span className={styles.holdRing} style={ring} data-holding />
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
