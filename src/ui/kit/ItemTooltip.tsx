/**
 * The kernel item card as a tooltip (K7 #199; #164): the full `ItemCard` over the control it
 * describes, opened by hover or focus after 250 ms, or by a 400 ms touch hold that fires no action.
 * While no describer answers it draws the control alone, exactly as before. The card is always in
 * the markup, hidden while closed, so assistive tech and specs read the same text.
 */
import type { ReactNode } from 'react'
import { itemCardIdOf, type ItemCardModel } from '../../systems/views/itemCardModel'
import { ItemCard } from './ItemCard'
import styles from './ItemTooltip.module.css'
import { useItemTooltip } from './useItemTooltip'

export function ItemTooltip({ card, children }: { card: ItemCardModel; children: ReactNode }) {
  if (card.description === null) return <>{children}</>
  return <DescribedItemTooltip card={card}>{children}</DescribedItemTooltip>
}

function DescribedItemTooltip({ card, children }: { card: ItemCardModel; children: ReactNode }) {
  const tooltip = useItemTooltip()
  return (
    <div className={styles.anchor} {...tooltip.handlers}>
      {children}
      <div
        role="tooltip"
        className={styles.tooltip}
        hidden={!tooltip.isOpen}
        data-item-tooltip={itemCardIdOf(card.item)}
      >
        <ItemCard variant="full" card={card} />
      </div>
    </div>
  )
}
