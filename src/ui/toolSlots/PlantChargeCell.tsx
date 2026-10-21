/**
 * Plant charge on the tool slot bar (ticket 691, the G&V ruling: it left the touch cluster with
 * its behaviour unchanged): a tap plants, as B does. While the rack holds two sizes the size it
 * plants rides the cell's upper corner (ticket 473) and a tap there steps the size, as V does.
 * The badge lies inside the cell's box, so it adds no box of its own.
 */
import { useState } from 'react'
import { readTouchSituation } from '../../store/screenReads'
import { pressTouchButton, releaseTouchButton } from '../../store/touchRuntime'
import { chargeSizeBadgeOf } from '../../systems/input/touchControls'
import type { ToolCellProps } from '../registries/toolSlots'
import { touchButtonIdOf } from '../stage/deviceIds'
import { useScreenModel } from '../useScreenModel'
import { TapToolCell } from './TapToolCell'
import styles from './ToolSlotBar.module.css'

const STEP_SIZE_ACTION = 'next_charge_size'

export function PlantChargeCell({ face }: ToolCellProps) {
  const size = useScreenModel(readChargeSizeBadge)
  return (
    <TapToolCell face={face} action="plant_charge">
      {size !== null && <ChargeSizeBadge size={size} />}
    </TapToolCell>
  )
}

function readChargeSizeBadge(): number | null {
  return chargeSizeBadgeOf(readTouchSituation())
}

function ChargeSizeBadge({ size }: { size: number }) {
  const [isPressed, setIsPressed] = useState(false)
  const press = () => {
    setIsPressed(true)
    pressTouchButton(STEP_SIZE_ACTION)
  }
  const release = () => {
    setIsPressed(false)
    releaseTouchButton(STEP_SIZE_ACTION)
  }
  return (
    <button
      type="button"
      className={styles.sizeBadge}
      data-testid={touchButtonIdOf(STEP_SIZE_ACTION)}
      data-pressed={isPressed || undefined}
      aria-label="Next charge size"
      tabIndex={-1}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={() => isPressed && release()}
    >
      {size}
    </button>
  )
}
