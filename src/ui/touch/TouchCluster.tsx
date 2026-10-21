/**
 * The right thumb's cluster (#173): Interact at 72 px and the other buttons at 56, each shown only
 * while its action is valid, each a glyph with no text. One row in the corner since ticket 691:
 * Plant charge, its size badge (ticket 473) and the guns toggle are tool slot bar cells.
 */
import { clusterIconIdOf, type ClusterActionId } from '../../systems/input/touchControls'
import { DEVICE_UI_IDS } from '../stage/deviceIds'
import { VectorIcon } from '../VectorIcon'
import { TouchButton } from './TouchButton'
import styles from './TouchControls.module.css'

export function TouchCluster({ actions }: { actions: readonly ClusterActionId[] }) {
  return (
    <div className={styles.cluster} data-testid={DEVICE_UI_IDS.touchCluster}>
      {actions.map((action) => (
        <TouchButton key={action} action={action}>
          <VectorIcon iconId={clusterIconIdOf(action)} size="menu" />
        </TouchButton>
      ))}
    </div>
  )
}
