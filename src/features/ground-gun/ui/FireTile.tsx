/**
 * The bore gun's fire tile on the touch controls' `slots` panel (ticket 314, #309 touch input): a
 * 56 px brass button beside the power-up slots, mirrored for the left hand. A tap fires along the
 * facing; a press held a moment repeats on each tick the recovery allows; a drag aims (the
 * reticle shows the snapped line) and fires on release. Its brass ring fills as the recovery
 * runs, so a long wait in rock is visible. Once the steam sear is researched its lamp sits on the
 * top-right corner, half outside: a 30-tick press there toggles auto-shoot and never fires or aims
 * (the GD's 3b ruling). Nothing until the gun is mounted. The gauge panel runs the gun's clock.
 */
import type { CSSProperties, PointerEvent } from 'react'
import { useGameStore } from '../../../store/gameStore'
import { VectorIcon } from '../../../ui/VectorIcon'
import { useScreenModel } from '../../../ui/useScreenModel'
import type { BoreAutoReading } from '../../../systems/views/boreAutoReading'
import { readGunPanel } from '../store/fireTileReads'
import { pressFireLamp, releaseFireLamp } from '../store/lampInput'
import { FireLamp } from './FireLamp'
import styles from './FireTile.module.css'
import { useFireTilePointer } from './useFireTilePointer'

export const FIRE_TILE_TEST_ID = 'ground-gun-fire-tile'

export function FireTile() {
  const panel = useScreenModel(readGunPanel)
  if (panel === null) return null
  return <ArmedFireTile recoveryFilledPercent={panel.recoveryFilledPercent} lamp={panel.lamp} />
}

function ArmedFireTile({
  recoveryFilledPercent,
  lamp,
}: {
  recoveryFilledPercent: number
  lamp: BoreAutoReading | null
}) {
  const pointer = useFireTilePointer()
  const isLeftHanded = useGameStore((state) => state.prefs.leftHanded)
  const ring = { '--recovery': `${recoveryFilledPercent}%` } as CSSProperties
  return (
    <div className={styles.dock} data-hand={isLeftHanded ? 'left' : 'right'}>
      {/* Touch only: Tab never stops here. */}
      <button
        type="button"
        className={styles.tile}
        style={ring}
        data-testid={FIRE_TILE_TEST_ID}
        data-recovering={recoveryFilledPercent < 100 || undefined}
        aria-label="Bore gun"
        tabIndex={-1}
        onPointerDown={pointer.onPointerDown}
        onPointerMove={pointer.onPointerMove}
        onPointerUp={pointer.onPointerUp}
        onPointerCancel={pointer.onPointerCancel}
      >
        <VectorIcon iconId="bore-gun-mount" size="menu" />
      </button>
      {lamp !== null && (
        <span className={styles.lampCorner}>
          <FireLamp lamp={lamp} handlers={LAMP_LONG_PRESS} />
        </span>
      )}
    </div>
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
