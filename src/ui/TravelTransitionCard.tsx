/**
 * The travel transition (#8, #10): at most 10 s, skippable. The authority moved the session to
 * the next planet before this shows, so skipping only ends the picture early.
 */
import { useEffect } from 'react'
import { TRAVEL_TRANSITION_SECONDS } from '../constants/scene'
import { useGameStore } from '../store/gameStore'
import type { TravelTransition } from '../systems/sliceProgress'
import { Button } from './kit/Button'
import { Panel } from './kit/Panel'
import styles from './SliceCard.module.css'

const MS_PER_SECOND = 1000

export function TravelTransitionCard() {
  const transition = useGameStore((state) => state.travelTransition)
  const finishTravelTransition = useGameStore((state) => state.finishTravelTransition)
  useEffect(
    () => endTransitionAfterItsTime(transition, finishTravelTransition),
    [transition, finishTravelTransition],
  )
  if (transition === null) return null

  return (
    <div className={styles.overlay}>
      <Panel title="Core drive engaged">
        <p className={styles.text}>
          Leaving planet {transition.fromPlanet} for planet {transition.toPlanet}.
        </p>
        <Button label="Skip" onPress={finishTravelTransition} />
      </Panel>
    </div>
  )
}

function endTransitionAfterItsTime(
  transition: TravelTransition | null,
  finish: () => void,
): () => void {
  if (transition === null) return () => {}
  const timer = setTimeout(finish, TRAVEL_TRANSITION_SECONDS * MS_PER_SECOND)
  return () => clearTimeout(timer)
}
