/**
 * The bore gun's cell on the tool slot bar (ticket 314's fire tile, on the bar since ticket 691):
 * the kernel's cell with the gun's mount glyph and its cooldown ring, the recovery still to run, so
 * a long wait in rock is visible. A tap fires along the facing; a press held a moment repeats on
 * each tick the recovery allows; a drag aims (the reticle shows the snapped line) and fires on
 * release. Once the steam sear is researched its lamp rides the cell's upper corner: a 30-tick
 * press there toggles auto-shoot and never fires or aims (the GD's 3b ruling). The gauge panel
 * runs the gun's clock.
 */
import type { PointerEvent } from 'react'
import type { ToolFace } from '../../../systems/input/toolSlots'
import { ToolCell } from '../../../ui/toolSlots/ToolCell'
import { useScreenModel } from '../../../ui/useScreenModel'
import { readGunPanel } from '../store/fireTileReads'
import { pressFireLamp, releaseFireLamp } from '../store/lampInput'
import { FireLamp } from './FireLamp'
import styles from './FireToolCell.module.css'
import { useFireTilePointer } from './useFireTilePointer'

export const FIRE_TILE_TEST_ID = 'ground-gun-fire-tile'

export function FireToolCell({ face }: { face: ToolFace }) {
  const pointer = useFireTilePointer()
  const lamp = useScreenModel(readGunPanel)?.lamp ?? null
  return (
    <ToolCell face={face} testId={FIRE_TILE_TEST_ID} pointer={pointer}>
      {lamp !== null && (
        <span className={styles.lampCorner}>
          <FireLamp lamp={lamp} handlers={LAMP_LONG_PRESS} />
        </span>
      )}
    </ToolCell>
  )
}

/** The pointer is captured, so a finger sliding off still lets go of the lamp. */
const LAMP_LONG_PRESS = {
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    pressFireLamp()
  },
  onPointerUp: releaseFireLamp,
  onPointerCancel: releaseFireLamp,
}
