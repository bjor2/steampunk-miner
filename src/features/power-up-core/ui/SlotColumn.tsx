/**
 * The power-up slot column on the touch controls' `slots` panel (#162 section 2.3, #173, #217):
 * on the thumb's edge above the cluster, one 56 px round button per slot holding a usable
 * power-up, mirrored for the left hand. Nothing while no slot holds one.
 */
import { useGameStore } from '../../../store/gameStore'
import { useScreenModel } from '../../../ui/useScreenModel'
import { readSlotButtons } from '../store/slotColumnReads'
import styles from './SlotColumn.module.css'
import { SlotButtonView } from './SlotButtonView'

export const SLOT_COLUMN_TEST_ID = 'power-up-slots'

export function SlotColumn() {
  const buttons = useScreenModel(readSlotButtons)
  const isLeftHanded = useGameStore((state) => state.prefs.leftHanded)
  if (buttons.length === 0) return null
  return (
    <div
      className={styles.column}
      data-testid={SLOT_COLUMN_TEST_ID}
      data-hand={isLeftHanded ? 'left' : 'right'}
    >
      {buttons.map((button) => (
        <SlotButtonView key={button.slot} button={button} />
      ))}
    </div>
  )
}
