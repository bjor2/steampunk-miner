/**
 * The brass odometer (spec #678, ticket 684; docs/ui/design-system.md section 6): the shared
 * formatter's text on parchment drum cells, each changed digit rolling in, the whole roll 0.6 s or
 * less (`--odometer-roll-max`), set at once under Reduce Motion. The text is the formatter's own,
 * so it reads the same as any other money readout; `data-exact` carries the canonical value.
 */
import { odometerCellsOf } from '../../systems/views/odometer'
import styles from './Odometer.module.css'

export function Odometer({ text, exact, testId }: { text: string; exact: string; testId: string }) {
  return (
    <span className={styles.odometer} data-testid={testId} data-exact={exact}>
      {odometerCellsOf(text).map((cell) => (
        <span key={cell.key} className={styles.cell} data-digit={cell.isDigit || undefined}>
          <span className={styles.face}>{cell.char}</span>
        </span>
      ))}
    </span>
  )
}
