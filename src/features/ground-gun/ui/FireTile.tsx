/**
 * The bore gun's fire tile on the touch controls' `slots` panel (ticket 314, #309 touch input): a
 * 56 px brass button beside the power-up slots, mirrored for the left hand. A tap fires along the
 * facing; a press held a moment repeats on each tick the recovery allows; a drag aims (the
 * reticle shows the snapped line) and fires on release. Its brass ring fills as the recovery
 * runs, so a long wait in rock is visible. Nothing until the gun is mounted.
 */
import type { CSSProperties } from 'react'
import { useGameStore } from '../../../store/gameStore'
import { VectorIcon } from '../../../ui/VectorIcon'
import { useScreenModel } from '../../../ui/useScreenModel'
import { readFireTile } from '../store/fireTileReads'
import styles from './FireTile.module.css'
import { useFireClock } from './useFireClock'
import { useFireTilePointer } from './useFireTilePointer'

export const FIRE_TILE_TEST_ID = 'ground-gun-fire-tile'

export function FireTile() {
  const tile = useScreenModel(readFireTile)
  if (tile === null) return null
  return <ArmedFireTile recoveryFilledPercent={tile.recoveryFilledPercent} />
}

function ArmedFireTile({ recoveryFilledPercent }: { recoveryFilledPercent: number }) {
  useFireClock()
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
    </div>
  )
}
