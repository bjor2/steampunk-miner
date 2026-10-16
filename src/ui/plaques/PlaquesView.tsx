/**
 * The hint plaque at the bottom centre and the transmission plaque below the top banner (#33
 * section 5, #16), drawn from the plaque model; markup only. Neither takes input or pauses play.
 * On the compact HUD (#500) the hint is a one-line chip under the HUD's rows instead, drawn only
 * once its place is measured and while it has room.
 */
import type { PlaqueModel, PlaqueReading } from '../../systems/views/plaqueModel'
import { hudBoxOf } from '../hud/hudBoxes'
import { UI_IDS } from '../ids'
import { Plaque } from '../kit/Plaque'
import { HintChip, type HintChipPlace } from './HintChip'
import styles from './Plaques.module.css'

export function PlaquesView({
  model,
  chipPlace = null,
  onDismissHint = ignoreDismiss,
  isCompact = false,
}: {
  model: PlaqueModel
  /** The compact hint chip's measured place; null until measured. */
  chipPlace?: HintChipPlace | null
  onDismissHint?: () => void
  isCompact?: boolean
}) {
  return (
    <div className={styles.plaques}>
      {model.transmission !== null && (
        <div className={styles.transmission} {...hudBoxOf('transmission')}>
          <Plaque
            lines={model.transmission.lines}
            iconId={model.transmission.iconId}
            testId={UI_IDS.hudTransmission}
          />
        </div>
      )}
      {model.hint !== null && (
        <Hint
          hint={model.hint}
          isCompact={isCompact}
          chipPlace={chipPlace}
          onDismiss={onDismissHint}
        />
      )}
    </div>
  )
}

/** The plaque on the full HUD; on the compact one the chip, once its place is measured. */
function Hint({
  hint,
  isCompact,
  chipPlace,
  onDismiss,
}: {
  hint: PlaqueReading
  isCompact: boolean
  chipPlace: HintChipPlace | null
  onDismiss: () => void
}) {
  if (!isCompact) return <HintPlaque hint={hint} />
  if (chipPlace === null) return null
  return <HintChip hint={hint} place={chipPlace} onDismiss={onDismiss} />
}

function HintPlaque({ hint }: { hint: PlaqueReading }) {
  return (
    <div className={styles.hint} data-hint={hint.id} {...hudBoxOf('hint')}>
      <Plaque lines={hint.lines} iconId={hint.iconId} testId={UI_IDS.hudHintPlaque} />
    </div>
  )
}

function ignoreDismiss(): void {}
