/**
 * The compact HUD's hint (#500, GD rulings 3, 4 and 6): a one-line chip under the HUD's rows, at
 * most 8% of the screen tall, its text cut with an ellipsis. A clean tap on it opens the whole
 * hint as a card that grows upward over the rows, never over the vehicle, and a second tap closes
 * it; its dismiss takes the hint down for good. The dismiss's hit area is the control minimum
 * around a smaller glyph and lies outside the chip's box. The only plaque that takes input (the
 * GD's narrow amendment of #16); a touch that starts outside it stays with the game.
 */
import type { CSSProperties } from 'react'
import type { ScreenBox } from '../../systems/views/hudClearView'
import type { PlaqueReading } from '../../systems/views/plaqueModel'
import { hudBoxOf } from '../hud/hudBoxes'
import { useHudCard } from '../hud/useHudCard'
import { UI_IDS } from '../ids'
import { Plaque } from '../kit/Plaque'
import styles from './Plaques.module.css'

export const HINT_DISMISS_TEST_ID = 'hud-hint-dismiss'

/** Where the chip sits inside the plaque layer: the screen box less the layer's own offset. */
export interface HintChipPlace {
  chip: ScreenBox
  layer: ScreenBox
}

export function HintChip({
  hint,
  place,
  onDismiss,
}: {
  hint: PlaqueReading
  place: HintChipPlace
  onDismiss: () => void
}) {
  const card = useHudCard()
  return (
    <div
      className={styles.chip}
      style={chipStyleOf(place, card.isOpen)}
      data-hint={hint.id}
      data-expanded={card.isOpen || undefined}
      {...hudBoxOf('hint')}
      {...card.handlers}
    >
      <Plaque lines={hint.lines} iconId={hint.iconId} testId={UI_IDS.hudHintPlaque} />
      <button
        type="button"
        className={styles.dismiss}
        data-testid={HINT_DISMISS_TEST_ID}
        aria-label="Dismiss the hint"
        onClick={onDismiss}
      />
    </div>
  )
}

/** Shut, the chip's own box; open, a card whose foot stays on the chip's and grows upward. */
function chipStyleOf({ chip, layer }: HintChipPlace, isOpen: boolean): CSSProperties {
  const across = { left: chip.left - layer.left, width: chip.right - chip.left }
  if (!isOpen) return { ...across, top: chip.top - layer.top, height: chip.bottom - chip.top }
  return { ...across, bottom: layer.bottom - chip.bottom, maxHeight: chip.bottom - layer.top }
}
