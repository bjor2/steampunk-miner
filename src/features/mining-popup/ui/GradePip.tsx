/**
 * An ore's grade as a small brass pip after its name (ticket 695, Producer on the done-when): one
 * dot per grade, 1 Raw to 5 Aether, and no text. The dot count is the cue, so it reads apart from
 * the rarity tint on the name for a colour-blind player; screen readers hear the grade's name.
 */
import type { CSSProperties } from 'react'
import type { OreFace } from '../systems/oreFace'
import styles from './GradePip.module.css'

export function GradePip({ face }: { face: OreFace }) {
  const dots = { '--grade-dots': face.grade } as CSSProperties
  return (
    <span
      className={styles.pip}
      style={dots}
      role="img"
      aria-label={`${face.gradeName} grade`}
      data-grade={face.grade}
    />
  )
}
