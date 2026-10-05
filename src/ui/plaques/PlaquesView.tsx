/**
 * The hint plaque at the bottom centre and the transmission plaque below the top banner (#33
 * section 5, #16), drawn from the plaque model; markup only. Neither takes input or pauses play.
 */
import type { PlaqueModel } from '../../systems/views/plaqueModel'
import { UI_IDS } from '../ids'
import { Plaque } from '../kit/Plaque'
import styles from './Plaques.module.css'

export function PlaquesView({ model }: { model: PlaqueModel }) {
  return (
    <div className={styles.plaques}>
      {model.transmission !== null && (
        <div className={styles.transmission}>
          <Plaque lines={model.transmission.lines} testId={UI_IDS.hudTransmission} />
        </div>
      )}
      {model.hint !== null && (
        <div className={styles.hint} data-hint={model.hint.id}>
          <Plaque lines={model.hint.lines} testId={UI_IDS.hudHintPlaque} />
        </div>
      )}
    </div>
  )
}
