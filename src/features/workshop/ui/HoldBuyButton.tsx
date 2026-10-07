/**
 * A plaque's Buy, held to chain (#180 section 2): a press buys one at once and holds on the curve,
 * letting go or sliding off the plaque ends the hold after the step in flight. A long-press on touch is the
 * same press, once the plaque's card is open: the first touch on a closed card only opens it (the
 * GD's input rules on #164). A ring fills over the wind-up while the hold runs, so the repeat is
 * seen coming. `data-reason` and `data-state` are the kernel row's (#33); the buy id is the
 * Buy's only while no card is drawn, since a card carries it. A keyboard or controller confirm
 * still buys one through the store's `pressScreenButton`, as on every bay button.
 */
import type { PointerEvent } from 'react'
import { readAuthorityTick, useGameStore } from '../../../store/gameStore'
import type { UpgradeId } from '../../../systems/economy/economyDefinition'
import type { ScreenButton } from '../../../systems/views/viewParts'
import { isHoldingTrack, useWorkshopStore } from '../store/workshopStore'
import type { PlaquePointer } from '../systems/plaquePress'
import { WORKSHOP_TEST_IDS } from './testIds'
import styles from './HoldBuyButton.module.css'

export function HoldBuyButton({
  button,
  upgradeId,
  focusedId,
  state,
  hasCard,
}: {
  button: ScreenButton
  upgradeId: UpgradeId
  focusedId: string
  state: string
  hasCard: boolean
}) {
  const isHolding = useWorkshopStore((now) => isHoldingTrack(now, upgradeId))
  return (
    <button
      type="button"
      className={styles.buy}
      data-testid={hasCard ? WORKSHOP_TEST_IDS.plaqueBuy(upgradeId) : button.id}
      data-reason={button.reason ?? undefined}
      data-state={state}
      data-focused={focusedId === button.id || undefined}
      data-holding={isHolding || undefined}
      disabled={button.reason !== null}
      onPointerDown={(event) =>
        pressToBuy(event, upgradeId, pointerOf(event, button, focusedId, hasCard))
      }
      onPointerMove={(event) => leaveWhenOffPlaque(event, upgradeId)}
      onPointerUp={() => useWorkshopStore.getState().releaseHold()}
      onPointerCancel={() => useWorkshopStore.getState().leaveTrack(upgradeId)}
      onContextMenu={(event) => event.preventDefault()}
      onClick={(event) => event.stopPropagation()}
      onFocus={() => focusPlaque(button.id, upgradeId)}
    >
      <span className={styles.ring} aria-hidden />
      {button.label}
    </button>
  )
}

/**
 * The left button or a finger only. The press keeps the game's focus (no browser focus moves) and
 * captures the pointer, so a plaque that grows or shrinks under a still pointer as its line
 * changes never ends the hold; only the pointer itself leaving the plaque does.
 */
function pressToBuy(
  event: PointerEvent<HTMLButtonElement>,
  upgradeId: UpgradeId,
  pointer: PlaquePointer,
): void {
  if (event.button !== 0) return
  event.preventDefault()
  event.currentTarget.setPointerCapture(event.pointerId)
  useWorkshopStore.getState().pressPlaqueBuy(upgradeId, readAuthorityTick(), pointer)
}

function pointerOf(
  event: PointerEvent<HTMLButtonElement>,
  button: ScreenButton,
  focusedId: string,
  hasCard: boolean,
): PlaquePointer {
  return {
    isTouch: event.pointerType === 'touch',
    isCardOpen: focusedId === button.id,
    hasCard,
    isBuyOpen: button.reason === null,
  }
}

/** "Focus leaving the plaque stops after the current step" (#180 section 2). */
function leaveWhenOffPlaque(event: PointerEvent<HTMLButtonElement>, upgradeId: UpgradeId): void {
  const plaque = event.currentTarget.closest('[data-plaque]') ?? event.currentTarget
  if (!isPointerOver(plaque.getBoundingClientRect(), event)) {
    useWorkshopStore.getState().leaveTrack(upgradeId)
  }
}

function isPointerOver(box: DOMRect, event: PointerEvent): boolean {
  const isWithinWidth = event.clientX >= box.left && event.clientX <= box.right
  return isWithinWidth && event.clientY >= box.top && event.clientY <= box.bottom
}

function focusPlaque(buttonId: string, upgradeId: UpgradeId): void {
  useGameStore.getState().focusControl(buttonId)
  useWorkshopStore.getState().selectTrack(upgradeId, readAuthorityTick())
}
