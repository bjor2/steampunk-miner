/**
 * The one kernel item card (K7 #199; Game Director decisions 1 and 9 on #164): the shop row, the
 * platform card and the tooltip all draw it, so they match by construction and print the same
 * strings. While no describer answers (`card.description` is null) it draws `children`, the row the
 * screen drew before, unchanged: the empty fast path.
 *
 * - `full`, the platform card and the tooltip: name, stat lines, cost, flavour, then the unlock
 *   line and the gate note (#159 line order), and the screen's action below.
 * - `compact`, the Upgrade bay's shop row, on the shared Title+OneLine element (spec #422, pass
 *   #425): the name, the first stat line with its change, the price, and the rest of the card in
 *   the brass tooltip (`itemCardElementOf`). Tapping or focusing it opens that tooltip in place; a
 *   second tap buys (`tapItemCard`), and `ui_confirm` buys the focused entry as before.
 */
import type { MouseEvent, ReactNode } from 'react'
import { useGameStore } from '../../store/gameStore'
import { itemCardElementOf } from '../../systems/views/itemCardElement'
import { itemCardIdOf, type ItemCardModel } from '../../systems/views/itemCardModel'
import { itemCardTextOf, type ItemCardText } from '../../systems/views/itemCardText'
import type { ScreenButton } from '../../systems/views/viewParts'
import styles from './ItemCard.module.css'
import { ItemCardBody, ItemCardName, priceFactsOf } from './ItemCardParts'
import { TitleOneLine } from './TitleOneLine'

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
  if (props.variant === 'full')
    return (
      <FullItemCard card={card} text={itemCardTextOf(card.description)} action={props.action} />
    )
  return <CompactItemCard card={card} buy={props.buy} focusedId={props.focusedId} />
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
  buy,
  focusedId,
}: {
  card: ItemCardModel
  buy: ScreenButton
  focusedId: string | null
}) {
  const isOpen = focusedId === buy.id
  const element = itemCardElementOf(`upgrade-bay.${buy.id}`, card)
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
      <TitleOneLine
        text={element.text}
        iconId={card.iconId}
        facts={priceFactsOf(card)}
        lockReason={element.lockReason}
        isTooltipHeldOpen={isOpen}
      />
    </div>
  )
}

/** A tap must not move the browser's focus off the game: the game owns menu focus. */
function keepFocusOnGame(event: MouseEvent): void {
  event.preventDefault()
}
