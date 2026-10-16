/**
 * The planet card (ticket 343, TD lock on #293 Q2): the live planet classes' hazards on arrival,
 * drawn after the travel card and over the bay screen while docked. The store opens it from
 * `planet_entered` and closes it on undock; it also closes on its timeout or on Dismiss. Every
 * class adds its line through the kernel's `planetCardLines`; no slice draws a card of its own.
 */
import { useEffect } from 'react'
import { PLANET_CARD_SECONDS } from '../../constants/scene'
import { useGameStore } from '../../store/gameStore'
import { shownPlanetCardOf } from '../../store/planetCardSlice'
import type { PlanetCard as ShownPlanetCard } from '../../systems/registries/planetCardLines'
import { planetCardViewOf, type PlanetCardLineView } from '../../systems/views/planetCardView'
import { Button } from '../kit/Button'
import { Panel } from '../kit/Panel'
import styles from './PlanetCard.module.css'

const MS_PER_SECOND = 1000

export function PlanetCard() {
  const shownCard = useGameStore(shownPlanetCardOf)
  const dismissPlanetCard = useGameStore((state) => state.dismissPlanetCard)
  useEffect(() => dismissAfterItsTime(shownCard, dismissPlanetCard), [shownCard, dismissPlanetCard])
  if (shownCard === null) return null

  const view = planetCardViewOf(shownCard)
  return (
    <div className={styles.anchor} role="status" data-testid="planet-card">
      <Panel title={`Planet ${view.planetIndex}`}>
        {view.lines.map((line) => (
          <PlanetCardLine key={line.sourceId} line={line} />
        ))}
        <Button label="Dismiss" onPress={dismissPlanetCard} />
      </Panel>
    </div>
  )
}

function PlanetCardLine({ line }: { line: PlanetCardLineView }) {
  return (
    <div className={styles.line}>
      <span className={styles.tag}>{line.tag}</span>
      {line.gateKind !== null && <span className={styles.tag}>{line.gateKind}</span>}
      <p className={styles.text}>{line.arrivalLine}</p>
      {line.values.map((value) => (
        <p key={value.label} className={styles.values}>
          {value.label} {value.text}
        </p>
      ))}
    </div>
  )
}

function dismissAfterItsTime(card: ShownPlanetCard | null, dismiss: () => void): () => void {
  if (card === null) return () => {}
  const timer = setTimeout(dismiss, PLANET_CARD_SECONDS * MS_PER_SECOND)
  return () => clearTimeout(timer)
}
