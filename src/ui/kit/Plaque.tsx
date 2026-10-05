/** The UI kit's small brass plaque (#13, #16): a few lines of text, never a button or a modal. */
import styles from './Plaque.module.css'

export function Plaque({ lines, testId }: { lines: readonly string[]; testId: string }) {
  return (
    <p className={styles.plaque} data-testid={testId}>
      {lines.map((line) => (
        <span key={line} className={styles.line}>
          {line}
        </span>
      ))}
    </p>
  )
}
