/**
 * The right thumb's cluster (#173): Interact at 72 px and the other buttons at 56, each shown only
 * while its action is valid and its part owned, each a glyph with no text. A press is the action's
 * key going down, a lift its key coming up.
 */
import { useState } from 'react'
import { ACTION_MAP, actionDefOf } from '../../systems/input/actionMap'
import { clusterIconIdOf, type ClusterActionId } from '../../systems/input/touchControls'
import { pressTouchButton, releaseTouchButton } from '../../store/touchRuntime'
import { DEVICE_UI_IDS, touchButtonIdOf } from '../stage/deviceIds'
import { VectorIcon } from '../VectorIcon'
import styles from './TouchControls.module.css'

export function TouchCluster({ actions }: { actions: readonly ClusterActionId[] }) {
  return (
    <div className={styles.cluster} data-testid={DEVICE_UI_IDS.touchCluster}>
      {actions.map((action) => (
        <TouchButton key={action} action={action} />
      ))}
    </div>
  )
}

function TouchButton({ action }: { action: ClusterActionId }) {
  const [isPressed, setIsPressed] = useState(false)
  const press = () => {
    setIsPressed(true)
    pressTouchButton(action)
  }
  const release = () => {
    setIsPressed(false)
    releaseTouchButton(action)
  }
  return (
    // Touch only: the keyboard has the keys themselves, so Tab never stops here.
    <button
      type="button"
      className={styles.button}
      data-testid={touchButtonIdOf(action)}
      data-action={action}
      data-pressed={isPressed || undefined}
      aria-label={actionDefOf(ACTION_MAP, action).displayName}
      tabIndex={-1}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={() => isPressed && release()}
    >
      <VectorIcon iconId={clusterIconIdOf(action)} size="menu" />
    </button>
  )
}
