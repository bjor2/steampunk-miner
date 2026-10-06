/**
 * The UI kit's small brass plaque (#13, #16): a few lines of text with a glyph of the icon set
 * beside them (#158), never a button or a modal.
 */
import { VectorIcon } from '../VectorIcon'
import styles from './Plaque.module.css'

export function Plaque({
  lines,
  iconId = null,
  testId,
}: {
  lines: readonly string[]
  iconId?: string | null
  testId: string
}) {
  return (
    <p className={styles.plaque} data-testid={testId}>
      {iconId !== null && <VectorIcon iconId={iconId} size="banner" />}
      <span className={styles.lines}>
        {lines.map((line) => (
          <span key={line} className={styles.line}>
            {line}
          </span>
        ))}
      </span>
    </p>
  )
}
