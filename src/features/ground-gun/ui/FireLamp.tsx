/**
 * The bore gun's brass auto lamp as a button (ticket 314, the GD's 3b ruling on #314, reading
 * ticket 317's `autoLampOf`): dark off, green firing, amber holding, its words in the label so
 * colour never says it alone. A 28 px hit target of its own; the parent places it and says what a
 * press does (a long press on the touch tile, a click on the desktop gauge).
 */
import type { ButtonHTMLAttributes } from 'react'
import type { BoreAutoReading } from '../../../systems/views/boreAutoReading'
import styles from './FireLamp.module.css'

export const FIRE_LAMP_TEST_ID = 'ground-gun-fire-lamp'

type LampHandlers = Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick' | 'onPointerDown' | 'onPointerUp' | 'onPointerCancel'
>

export function FireLamp({ lamp, handlers }: { lamp: BoreAutoReading; handlers: LampHandlers }) {
  return (
    <button
      type="button"
      className={styles.lamp}
      data-testid={FIRE_LAMP_TEST_ID}
      data-lamp={lamp.colour}
      data-hold={lamp.hold ?? ''}
      aria-label={`Bore gun auto: ${lamp.text}`}
      title={lamp.text}
      {...handlers}
    />
  )
}
