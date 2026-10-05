/**
 * The frame both bay screens share (#33 section 6, #37): the header, the bay's own panels, then
 * the footer. Markup only.
 */
import type { ReactNode } from 'react'
import type { BayFooter as Footer, BayHeader as Header } from '../../systems/views/bayFrame'
import { UI_IDS } from '../ids'
import { BayFooter } from './BayFooter'
import { BayHeader } from './BayHeader'
import styles from './Platform.module.css'

export function BayFrame({
  header,
  footer,
  focusedId,
  children,
}: {
  header: Header
  footer: Footer
  focusedId: string
  children: ReactNode
}) {
  return (
    <div className={styles.screen} data-testid={UI_IDS.platformScreen} data-bay={header.bay}>
      <BayHeader header={header} />
      {children}
      <BayFooter footer={footer} focusedId={focusedId} />
    </div>
  )
}
