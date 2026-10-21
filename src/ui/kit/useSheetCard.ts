/**
 * A sheet card's press (spec #678, ticket 686): remembers what pressed it last, a finger, a pen or
 * a mouse, and hands the press to the store, which answers reveal or act (`cardReveal.ts`). A
 * click with no pointer behind it is Enter or Space on the focused card. A reveal ticks the haptics
 * as a tap does (design-system.md section 7); an act runs the card's action.
 */
import { useCallback, useRef, type MouseEvent, type PointerEvent } from 'react'
import { useGameStore } from '../../store/gameStore'
import type { CardPress, CardPresser } from '../../systems/views/cardReveal'
import { DESIGN_TOKENS } from '../../systems/views/designSystem'
import { tickHapticsOnHold } from './holdHaptics'
import { tapPointerOf } from './tapTarget'

export interface SheetCardPress {
  isRevealed: boolean
  notePointer: (event: PointerEvent) => void
  pressCard: (event: MouseEvent) => void
}

export function useSheetCard(cardId: string, onAct: () => void): SheetCardPress {
  const isRevealed = useGameStore((state) => state.revealedSheetCardId === cardId)
  const lastPointer = useRef<CardPresser>('mouse')
  const notePointer = useCallback((event: PointerEvent) => {
    lastPointer.current = tapPointerOf(event.pointerType)
  }, [])
  const pressCard = useCallback(
    (event: MouseEvent) => {
      const presser = presserOf(event, lastPointer.current)
      answerPress(useGameStore.getState().pressSheetCard(cardId, presser), onAct)
    },
    [cardId, onAct],
  )
  return { isRevealed, notePointer, pressCard }
}

/** A click the keyboard made carries no pointer detail. */
function presserOf(event: MouseEvent, lastPointer: CardPresser): CardPresser {
  return event.detail === 0 ? 'keyboard' : lastPointer
}

function answerPress(press: CardPress, onAct: () => void): void {
  if (press === 'act') onAct()
  else tickHapticsOnHold(DESIGN_TOKENS.haptics.tapMs)
}
