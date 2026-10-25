/**
 * The travel transition (#8, #10): at most 10 s, a star-map jump's at most 2 s (ticket 755),
 * skippable. The authority moved the session to the new planet before this shows, so skipping
 * only ends the picture early. On brass since ticket 885: the kit's sheet-framed panel, the
 * destination's name and its gravity, its trait (#724), as icon-plus-value facts, and the kit's
 * Skip. Markup only: the view is `travelCardViewOf`.
 */
import { useEffect } from 'react'
import { useGameStore } from '../../store/gameStore'
import type { TravelTransition } from '../../systems/sliceProgress'
import { TRAVEL_CARD_TEST_ID } from '../../systems/views/travelCardIds'
import { travelCardViewOf } from '../../systems/views/travelCardView'
import { Button } from '../kit/Button'
import { Panel } from '../kit/Panel'
import styles from './TravelTransitionCard.module.css'

const MS_PER_SECOND = 1000

export function TravelTransitionCard() {
  const transition = useGameStore((state) => state.travelTransition)
  const finishTravelTransition = useGameStore((state) => state.finishTravelTransition)
  useEffect(
    () => endTransitionAfterItsTime(transition, finishTravelTransition),
    [transition, finishTravelTransition],
  )
  if (transition === null) return null
  return <TravelCardView transition={transition} onSkip={finishTravelTransition} />
}

export function TravelCardView({
  transition,
  onSkip,
}: {
  transition: TravelTransition
  onSkip: () => void
}) {
  const view = travelCardViewOf(transition)
  return (
    <div className={styles.anchor} data-testid={TRAVEL_CARD_TEST_ID}>
      <Panel
        frame="sheet"
        title={view.title}
        iconId={view.iconId}
        heading={view.heading}
        facts={view.facts}
      >
        <Button label="Skip" onPress={onSkip} />
      </Panel>
    </div>
  )
}

function endTransitionAfterItsTime(
  transition: TravelTransition | null,
  finish: () => void,
): () => void {
  if (transition === null) return () => {}
  const timer = setTimeout(finish, transition.seconds * MS_PER_SECOND)
  return () => clearTimeout(timer)
}
