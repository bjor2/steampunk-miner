/**
 * A plaque's rivet pips toward the next big level (#180 section 3, GD rule 3): filled per step,
 * the last one glowing when the big level-up is one buy away. Markup only.
 */
import { pipRowOf } from '../systems/plaqueReading'
import styles from './TrackPlaque.module.css'

export function PipRowView({ step, testId }: { step: number; testId: string }) {
  const pips = pipRowOf(step)
  return (
    <span
      className={styles.pips}
      data-testid={testId}
      data-filled={pips.filled}
      data-jump-next={pips.isJumpNext || undefined}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={pips.count}
      aria-valuenow={pips.filled}
    >
      {Array.from({ length: pips.count }, (_, at) => (
        <span key={at} className={styles.pip} data-filled={at < pips.filled || undefined} />
      ))}
    </span>
  )
}
