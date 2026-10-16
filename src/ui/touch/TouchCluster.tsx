/**
 * The right thumb's cluster (#173): Interact at 72 px and the other buttons at 56, each shown only
 * while its action is valid and its part owned, each a glyph with no text.
 */
import { clusterIconIdOf, type ClusterActionId } from '../../systems/input/touchControls'
import { DEVICE_UI_IDS } from '../stage/deviceIds'
import { TouchButton } from './TouchButton'
import styles from './TouchControls.module.css'

export function TouchCluster({ actions }: { actions: readonly ClusterActionId[] }) {
  return (
    <div className={styles.cluster} data-testid={DEVICE_UI_IDS.touchCluster}>
      {actions.map((action) => (
        <TouchButton key={action} action={action} iconId={clusterIconIdOf(action)} />
      ))}
    </div>
  )
}
