/**
 * Plant charge on the tool slot bar (ticket 691, the G&V ruling: it left the touch cluster with
 * its behaviour unchanged): a tap plants, as B does. While the rack holds two sizes the size it
 * plants rides the cell's upper corner (ticket 473); the tap that steps it, as V does, is the
 * charge size cell beside it, so the badge only reads and every target keeps the cell's size.
 */
import { readTouchSituation } from '../../store/screenReads'
import { chargeSizeBadgeOf } from '../../systems/input/touchControls'
import type { ToolCellProps } from '../registries/toolSlots'
import { DEVICE_UI_IDS } from '../stage/deviceIds'
import { useScreenModel } from '../useScreenModel'
import { TapToolCell } from './TapToolCell'
import styles from './ToolSlotBar.module.css'

export function PlantChargeCell({ face }: ToolCellProps) {
  const size = useScreenModel(readChargeSizeBadge)
  return (
    <TapToolCell face={face} action="plant_charge">
      {size !== null && (
        <span className={styles.sizeBadge} data-testid={DEVICE_UI_IDS.chargeSizeBadge}>
          {size}
        </span>
      )}
    </TapToolCell>
  )
}

function readChargeSizeBadge(): number | null {
  return chargeSizeBadgeOf(readTouchSituation())
}
