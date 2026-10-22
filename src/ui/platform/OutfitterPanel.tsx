/**
 * The Outfitter (spec #678, ticket 687; design-system.md section 11): the Upgrade bay's cards
 * (`outfitterCards`), each with its gain text and its price, greyed while the wallet is short, and
 * under the price "Affordable" or "{N} trips away" once a trip is done (ticket 719). A
 * card is the bay's own button (`MenuSheetCard`): a tap, a click or the pad's A on the focused card
 * presses it through the store, so the bay's ids stay the cards' `data-testid` and the authority
 * answers as before. The kernel's own bay frame draws them while no slice owns the bay; the slice
 * that does draws them as a sheet tab. Markup only.
 */
import type { OutfitterCard } from '../../systems/views/outfitterCards'
import { MenuSheetCard } from '../kit/MenuSheetCard'
import { SheetCard } from '../kit/SheetCard'
import { SHEET_UI_IDS } from '../sheet/sheetIds'
import styles from './OutfitterPanel.module.css'

export function OutfitterPanelView({
  cards,
  focusedId,
}: {
  cards: readonly OutfitterCard[]
  /** The game's menu focus on the bay. */
  focusedId: string | null
}) {
  return (
    <div className={styles.cards} data-testid={SHEET_UI_IDS.outfitterCards}>
      {cards.map((card) => (
        <OutfitterCardView key={card.id} card={card} focusedId={focusedId} />
      ))}
    </div>
  )
}

function OutfitterCardView({ card, focusedId }: { card: OutfitterCard; focusedId: string | null }) {
  const text = { id: card.id, title: card.title, line: card.line }
  const look = {
    iconId: card.iconId,
    figure: card.priceText,
    figureNote: card.guidanceText,
    isMuted: card.isMuted,
  }
  if (card.buttonId === null) return <SheetCard text={text} {...look} onAct={pressNothing} />
  return <MenuSheetCard text={text} {...look} buttonId={card.buttonId} focusedId={focusedId} />
}

/** A Mastered entry has no button: its card shows and presses nothing. */
function pressNothing(): void {}
