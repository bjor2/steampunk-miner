/**
 * The thin surface-to-core gauge beside a depth value (ticket 703, GD lock on #703): the edge
 * gauge's trough and bead (ticket 684) laid on its side, the surface at its left and the core at
 * its right. Fraction only, never a number: the depth beside it is the value.
 */
import type { CSSProperties } from 'react'
import styles from './MiniGauge.module.css'

const PERMILLE = 1000

export function MiniGauge({ permille }: { permille: number }) {
  return (
    <span
      className={styles.trough}
      data-permille={permille}
      role="meter"
      aria-label="To the core"
      aria-valuemin={0}
      aria-valuemax={PERMILLE}
      aria-valuenow={permille}
      style={markStyleOf(permille)}
    >
      <span className={styles.mark} />
    </span>
  )
}

function markStyleOf(permille: number): CSSProperties {
  return { '--mark': permille / PERMILLE } as CSSProperties
}
