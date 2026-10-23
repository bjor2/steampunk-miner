/**
 * A brass key tag (spec #678, ticket 768; Progression's key tags in the GD lock of 23 Oct): the
 * key that presses a control, stamped on a small brass plate. Desktop only; a phone never draws
 * one. It reads, never presses: the key does that. `corner` rides a cell's upper corner inside its
 * box, `inline` sits beside a label.
 */
import styles from './KeyTag.module.css'

export function KeyTag({ label, place }: { label: string; place: 'corner' | 'inline' }) {
  return (
    <kbd className={styles.tag} data-key-tag={label} data-place={place} aria-hidden>
      {label}
    </kbd>
  )
}
