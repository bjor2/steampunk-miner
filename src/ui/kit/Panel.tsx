/** The UI kit's one surface: a brass-framed panel, its title with a glyph of the icon set (#158). */
import type { ReactNode } from 'react'
import { VectorIcon } from '../VectorIcon'
import styles from './Panel.module.css'

export function Panel({
  title,
  iconId = null,
  children,
}: {
  title: string
  iconId?: string | null
  children: ReactNode
}) {
  return (
    <section className={styles.panel}>
      <h2 className={styles.title}>
        {iconId !== null && <VectorIcon iconId={iconId} size="menu" />}
        {title}
      </h2>
      {children}
    </section>
  )
}
