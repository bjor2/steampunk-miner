/**
 * The one kernel item card (K7 #199; Game Director decisions 1 and 9 on #164): the shop row, the
 * platform card and the tooltip all draw it, so they match by construction and print the same
 * strings. While no describer answers (`card.description` is null) it draws `children`, the row the
 * screen drew before, unchanged: the empty fast path.
 *
 * - `full`, the platform card and the tooltip: name, stat lines, cost, flavour, then the unlock
 *   line and the gate note (#159 line order), and the screen's action below.
 * - `compact`, the shop row: the same icon, name and line order, cut to the first stat line with
 *   its change and the cost. Tapping or focusing it opens the full card in place; a second tap buys
 *   (`tapItemCard`), and `ui_confirm` buys the focused entry as before.
 */
import type { MouseEvent, ReactNode } from 'react'
import { useGameStore } from '../../store/gameStore'
import { itemCardIdOf, type ItemCardModel } from '../../systems/views/itemCardModel'
import { itemCardTextOf, type ItemCardText } from '../../systems/views/itemCardText'
import type { ScreenButton } from '../../systems/views/viewParts'
import styles from './ItemCard.module.css'
import { AppendedCost, FirstStatLine, ItemCardBody, ItemCardName } from './ItemCardParts'

type ItemCardProps =
  | { variant: 'full'; card: ItemCardModel; action?: ReactNode; children?: ReactNode }
  | {
      variant: 'compact'
      card: ItemCardModel
      buy: ScreenButton
      focusedId: string | null
      children: ReactNode
    }

export function ItemCard(props: ItemCardProps) {
  const { card } = props
  if (card.description === null) return <>{props.children}</>
  const text = itemCardTextOf(card.description)
  if (props.variant === 'full')
    return <FullItemCard card={card} text={text} action={props.action} />
  return <CompactItemCard card={card} text={text} buy={props.buy} focusedId={props.focusedId} />
}

function FullItemCard({
  card,
  text,
  action,
}: {
  card: ItemCardModel
  text: ItemCardText
  action: ReactNode
}) {
  return (
    <article className={styles.card} data-item-card={itemCardIdOf(card.item)} data-variant="full">
      <ItemCardName card={card} />
      <ItemCardBody card={card} text={text} />
      {action}
    </article>
  )
}

function CompactItemCard({
  card,
  text,
  buy,
  focusedId,
}: {
  card: ItemCardModel
  text: ItemCardText
  buy: ScreenButton
  focusedId: string | null
}) {
  const isOpen = focusedId === buy.id
  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={isOpen}
      className={styles.card}
      data-item-card={itemCardIdOf(card.item)}
      data-variant="compact"
      data-testid={buy.id}
      data-reason={buy.reason ?? undefined}
      data-focused={isOpen || undefined}
      onMouseDown={keepFocusOnGame}
      onFocus={() => useGameStore.getState().focusControl(buy.id)}
      onClick={() => useGameStore.getState().tapItemCard(buy.id)}
    >
      <ItemCardName card={card} />
      {isOpen ? <ItemCardBody card={card} text={text} /> : <ClosedRow card={card} text={text} />}
    </div>
  )
}

/** The closed shop row: the first stat line with its change, and the cost appended. */
function ClosedRow({ card, text }: { card: ItemCardModel; text: ItemCardText }) {
  return (
    <p className={styles.row}>
      <FirstStatLine lines={text.lines} />
      <AppendedCost card={card} />
    </p>
  )
}

/** A tap must not move the browser's focus off the game: the game owns menu focus. */
function keepFocusOnGame(event: MouseEvent): void {
  event.preventDefault()
}
