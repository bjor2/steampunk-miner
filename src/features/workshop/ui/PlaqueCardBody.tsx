/**
 * The open card on a plaque (#164): the kernel item card's stat lines, cost, flavour and notes,
 * drawn by the kernel's own `ItemCardBody` so the plaque prints the same strings as every other
 * shop entry. Nothing while no describer answers. Markup only.
 */
import { ItemCardBody } from '../../../ui/kit/ItemCardParts'
import type { ItemCardModel } from '../../../systems/views/itemCardModel'
import { itemCardTextOf } from '../../../systems/views/itemCardText'
import styles from './TrackPlaque.module.css'

export function PlaqueCardBody({ card }: { card: ItemCardModel }) {
  if (card.description === null) return null
  return (
    <div className={styles.card}>
      <ItemCardBody card={card} text={itemCardTextOf(card.description)} />
    </div>
  )
}
