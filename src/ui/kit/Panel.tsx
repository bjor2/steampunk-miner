/** The UI kit's one surface: a brass-framed panel. Presentational only; no game rules. */
import type { ReactNode } from 'react'
import styles from './Panel.module.css'

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.panel}>
      <h2 className={styles.title}>{title}</h2>
      {children}
    </section>
  )
}
