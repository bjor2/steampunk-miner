/**
 * A plaque's Buy, held to chain (#180 section 2): a press buys one at once and holds on the curve,
 * letting go or sliding off ends the hold after the step in flight. A long-press on touch is the
 * same press; a ring fills over the wind-up while the hold runs, so the repeat is seen coming. The
 * id, `data-reason` and `data-state` are the kernel row's (#33), and a keyboard or controller
 * confirm still buys one through the store's `pressScreenButton`, as on every bay button.
 */
import type { PointerEvent } from 'react'
import { readAuthorityTick, useGameStore } from '../../../store/gameStore'
import type { UpgradeId } from '../../../systems/economy/economyDefinition'
import type { ScreenButton } from '../../../systems/views/viewParts'
import { isHoldingTrack, useWorkshopStore } from '../store/workshopStore'
import styles from './HoldBuyButton.module.css'

export function HoldBuyButton({
  button,
  upgradeId,
  focusedId,
  state,
}: {
  button: ScreenButton
  upgradeId: UpgradeId
  focusedId: string
  state: string
}) {
  const isHolding = useWorkshopStore((now) => isHoldingTrack(now, upgradeId))
  return (
    <button
      type="button"
      className={styles.buy}
      data-testid={button.id}
      data-reason={button.reason ?? undefined}
      data-state={state}
      data-focused={focusedId === button.id || undefined}
      data-holding={isHolding || undefined}
      disabled={button.reason !== null}
      onPointerDown={(event) => pressToBuy(event, upgradeId)}
      onPointerUp={() => useWorkshopStore.getState().releaseHold()}
      onPointerLeave={() => useWorkshopStore.getState().leaveTrack(upgradeId)}
      onPointerCancel={() => useWorkshopStore.getState().leaveTrack(upgradeId)}
      onContextMenu={(event) => event.preventDefault()}
      onFocus={() => focusPlaque(button.id, upgradeId)}
    >
      <span className={styles.ring} aria-hidden />
      {button.label}
    </button>
  )
}

/**
 * The left button or a finger only. The press keeps the game's focus (no browser focus moves),
 * and a finger's implicit capture is let go so sliding off the plaque ends the hold.
 */
function pressToBuy(event: PointerEvent<HTMLButtonElement>, upgradeId: UpgradeId): void {
  if (event.button !== 0) return
  event.preventDefault()
  event.currentTarget.releasePointerCapture(event.pointerId)
  useWorkshopStore.getState().pressTrack(upgradeId, readAuthorityTick())
}

function focusPlaque(buttonId: string, upgradeId: UpgradeId): void {
  useGameStore.getState().focusControl(buttonId)
  useWorkshopStore.getState().selectTrack(upgradeId, readAuthorityTick())
}
