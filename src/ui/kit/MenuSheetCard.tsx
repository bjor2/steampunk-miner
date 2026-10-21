/**
 * A sheet card that is a button of the menu under the sheet (ticket 687: the Outfitter's cards
 * are the Upgrade bay's buy buttons). A finger reveals then acts and a mouse acts at once, as on
 * any sheet card (#686), through the store's `pressScreenButton`; the game's menu focus lights it
 * and shows its line, and the browser's focus and the menu focus are one, as on `ScreenButtonView`.
 * A key never clicks it: the game already confirms the focused button from the same Enter, Space
 * or the pad's A (`ui_confirm`), so one press buys once.
 */
import type { MouseEvent } from 'react'
import { useGameStore } from '../../store/gameStore'
import { SheetCardView, type SheetCardProps } from './SheetCard'
import { useSheetCard } from './useSheetCard'

export interface MenuSheetCardProps extends Omit<SheetCardProps, 'onAct' | 'testId'> {
  /** The menu button it presses; also its `data-testid`. */
  buttonId: string
  /** The game's menu focus on the screen under the sheet. */
  focusedId: string | null
}

export function MenuSheetCard({ buttonId, focusedId, ...card }: MenuSheetCardProps) {
  const press = useSheetCard(card.text.id, () => pressMenuButton(buttonId))
  return (
    <SheetCardView
      {...card}
      testId={buttonId}
      isRevealed={press.isRevealed}
      isFocused={focusedId === buttonId}
      onPointerDown={press.notePointer}
      onPress={(event) => pressUnlessFromKey(event, press.pressCard)}
      onFocus={() => useGameStore.getState().focusControl(buttonId)}
    />
  )
}

function pressMenuButton(buttonId: string): void {
  useGameStore.getState().pressScreenButton(buttonId)
}

/** A key's click has `detail` 0; the game's `ui_confirm` has already pressed the button. */
function pressUnlessFromKey(event: MouseEvent, pressCard: (event: MouseEvent) => void): void {
  if (event.detail !== 0) pressCard(event)
}
