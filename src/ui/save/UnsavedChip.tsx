/**
 * "Progress not saved" (#470 P1-8, ticket 479): over every layer while the session's last slot
 * write reached no store, with Export, which hands over the save the store could not keep. It goes
 * once the next write lands. The view is markup only; the text is `unsavedChipText.ts`.
 */
import { useGameStore } from '../../store/gameStore'
import type { SaveFailureCause } from '../../systems/save/saveWriteFailure'
import { unsavedChipTextOf } from '../../systems/views/unsavedChipText'
import { Button } from '../kit/Button'
import { TitleOneLine } from '../kit/TitleOneLine'
import { UI_IDS } from '../ids'
import styles from './UnsavedChip.module.css'

export function UnsavedChip() {
  const cause = useGameStore((state) => state.unsavedProgress?.cause ?? null)
  return cause === null ? null : <UnsavedChipView cause={cause} />
}

export function UnsavedChipView({ cause }: { cause: SaveFailureCause }) {
  return (
    <div className={styles.chip} data-testid={UI_IDS.unsavedChip} data-cause={cause}>
      <TitleOneLine text={unsavedChipTextOf(cause)} level="span">
        <Button label="Export" onPress={exportSave} testId={UI_IDS.unsavedChipExport} />
      </TitleOneLine>
    </div>
  )
}

function exportSave(): void {
  useGameStore.getState().exportSave()
}
