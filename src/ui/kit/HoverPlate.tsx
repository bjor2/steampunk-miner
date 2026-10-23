/**
 * A desktop hover's brass plate (spec #678, ticket 768): the lines a resting mouse shows beside a
 * control, a tool's name and hover line or a figure's full value, in the brass tooltip's look. It
 * is drawn only while hovered, so a phone's markup never holds it, and it never takes the pointer,
 * so a hover can only show: a click is what acts.
 */
import styles from './HoverPlate.module.css'

export function HoverPlate({
  id,
  lines,
  side,
  align = 'start',
}: {
  /** What the plate describes: it carries it as `data-hover-plate`. */
  id: string
  lines: readonly string[]
  side: 'above' | 'below'
  align?: 'start' | 'end'
}) {
  if (lines.length === 0) return null
  return (
    <span
      role="tooltip"
      className={styles.plate}
      data-hover-plate={id}
      data-side={side}
      data-align={align}
    >
      {lines.map((line) => (
        <span key={line} className={styles.line}>
          {line}
        </span>
      ))}
    </span>
  )
}
