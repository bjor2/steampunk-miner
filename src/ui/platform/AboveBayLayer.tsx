/**
 * The `above` bay panel slot (ticket 220, TD lock on #176): a full-canvas layer drawn over the bay
 * screen that lets clicks through, so the sell burst's coins cross the open bay to the money
 * counter. With no panel registered it draws nothing at all.
 */
import { bayPanelsOf } from '../registries/bayPanels'
import styles from './AboveBayLayer.module.css'

export function AboveBayLayer() {
  const panels = bayPanelsOf('above')
  if (panels.length === 0) return null
  return (
    <div className={styles.layer}>
      {panels.map(({ id, Panel }) => (
        <Panel key={id} />
      ))}
    </div>
  )
}
