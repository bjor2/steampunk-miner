/**
 * The end-of-slice card (#2 done item 5): shown once the core of the slice's last planet is
 * complete. Play goes on behind it; closing it is local to this screen.
 */
import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { isSliceEndReached } from '../systems/sliceProgress'
import { Button } from './kit/Button'
import { Panel } from './kit/Panel'
import styles from './SliceCard.module.css'

export function EndOfSliceCard() {
  const planetTier = useGameStore((state) => state.planetTier)
  const isCoreCompleted = useGameStore((state) => state.isCoreCompleted)
  const [isClosed, setIsClosed] = useState(false)
  const isShown = isSliceEndReached(planetTier, isCoreCompleted) && !isClosed
  if (!isShown) return null

  return (
    <div className={styles.overlay}>
      <Panel title="End of the slice">
        <p className={styles.text}>
          The core of planet {planetTier} is in the bay. This is as far as the slice goes.
        </p>
        <Button label="Keep digging" onPress={() => setIsClosed(true)} />
      </Panel>
    </div>
  )
}
