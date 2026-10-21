/**
 * The sheet's card (spec #678, ticket 686; design-system.md section 10): a title of 3 words or
 * fewer plus one line of 12 or fewer in the card frame, an optional icon and an optional figure
 * beside the title (a price, a count). Where no pointer hovers, the first tap shows the line and
 * the second acts; a mouse shows it on hover and the keyboard on focus, and their press acts at
 * once. The whole card is the one 44 px target. It records its texts in the budget registry like
 * the Title+OneLine element, so the copy budgets read the cards as drawn.
 */
import type { FocusEvent, MouseEvent, PointerEvent, ReactNode } from 'react'
import { recordUiText } from '../../systems/views/uiText'
import { VectorIcon } from '../VectorIcon'
import styles from './SheetCard.module.css'
import { useSheetCard } from './useSheetCard'

/** What a card draws: its id (`data-sheet-card`), its title and its one line. */
export interface SheetCardText {
  id: string
  title: string
  line: string
}

export interface SheetCardProps {
  text: SheetCardText
  /** The card's action: its one verb (Buy, Fit, Sell, Scrap, Travel). */
  onAct: () => void
  iconId?: string | null
  /** A figure beside the title, never a control: a price, a count. */
  figure?: ReactNode
  /** Greyed, as a price the wallet cannot pay (#687); the press still reaches the action. */
  isMuted?: boolean
  testId?: string
}

export function SheetCard(props: SheetCardProps) {
  const press = useSheetCard(props.text.id, props.onAct)
  return (
    <SheetCardView
      {...props}
      isRevealed={press.isRevealed}
      onPointerDown={press.notePointer}
      onPress={press.pressCard}
    />
  )
}

/** The card as its reveal draws it: the line folded, or shown after a first tap. */
export function SheetCardView({
  text,
  iconId = null,
  figure = null,
  isMuted = false,
  testId,
  isRevealed,
  isFocused = false,
  onPointerDown,
  onPress,
  onFocus,
}: Omit<SheetCardProps, 'onAct'> & {
  isRevealed: boolean
  /** The game's menu focus is on it (a pad's d-pad, ticket 687): lit, its line shown. */
  isFocused?: boolean
  onPointerDown: (event: PointerEvent) => void
  onPress: (event: MouseEvent) => void
  onFocus?: (event: FocusEvent) => void
}) {
  recordUiText({ id: text.id, title: text.title, oneLine: text.line, tooltipLines: [], lines: [] })
  return (
    <button
      type="button"
      className={styles.card}
      data-sheet-card={text.id}
      data-ui-text={text.id}
      data-revealed={isRevealed || isFocused || undefined}
      data-focused={isFocused || undefined}
      data-muted={isMuted || undefined}
      data-testid={testId}
      onPointerDown={onPointerDown}
      onMouseDown={keepFocusOnGame}
      onClick={onPress}
      onFocus={onFocus}
    >
      <span className={styles.head}>
        {iconId !== null && <VectorIcon iconId={iconId} size="menu" />}
        <span className={styles.title}>{text.title}</span>
        {figure !== null && <span className={styles.figure}>{figure}</span>}
      </span>
      <span className={styles.reveal}>
        <span className={styles.line} data-sheet-card-line>
          {text.line}
        </span>
      </span>
    </button>
  )
}

/** As the kit's Button: a click never leaves the card focused, so keys go back to the game. */
function keepFocusOnGame(event: MouseEvent): void {
  event.preventDefault()
}
