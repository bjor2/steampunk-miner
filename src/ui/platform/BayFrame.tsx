/**
 * The frame both bay screens share (#33 section 6, #37, #45): the header, the bay's own panels,
 * then the footer, in one chrome whose accent names the bay (copper for Sell, teal for Upgrade).
 * Every text in it is set at 2.2% of the screen's short axis, labels and titles included, so it
 * reads on a 4K projector across a room; on a phone it keeps the reference screen's size, and TV
 * mode enlarges it with the rest of the UI (#173). Markup only.
 */
import type { CSSProperties, ReactNode } from 'react'
import type { BayFooter as Footer, BayHeader as Header } from '../../systems/views/bayFrame'
import { UI_IDS } from '../ids'
import { BayFooter } from './BayFooter'
import { BayHeader } from './BayHeader'
import styles from './Platform.module.css'

/** The layout's `--shop-text` (`shopTextPixelsOf`); the kit's labels follow it instead of 0.8rem. */
const SHOP_TYPE = {
  fontSize: 'var(--shop-text)',
  '--kit-label-size': '1em',
} as CSSProperties

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
    <div
      className={styles.screen}
      style={SHOP_TYPE}
      data-testid={UI_IDS.platformScreen}
      data-bay={header.bay}
      data-accent={header.accent}
    >
      <BayHeader header={header} />
      {children}
      <BayFooter footer={footer} focusedId={focusedId} />
    </div>
  )
}
