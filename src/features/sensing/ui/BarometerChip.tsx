/**
 * The hazard barometer's warning (#162 Sensing row): one chip over the nearest warned cell ahead
 * of the drill, naming the hazard and how many cells ahead it is. Draws nothing while the
 * barometer is not owned or nothing lies ahead. Reads only the sensing store.
 */
import { useMemo } from 'react'
import { OverlayCard } from '../../../ui/overlay/OverlayCard'
import type { BarometerWarning } from '../systems/hazardBarometer'
import { barometerTextOf } from '../systems/render/passiveText'
import { useSensingStore } from '../store/sensingStore'
import { tileCentreOf } from './tileCentre'
import { SENSING_TEST_IDS } from './testIds'
import styles from './BarometerChip.module.css'

export function BarometerChip() {
  const nearest = useSensingStore((state) => state.passives.barometer?.[0] ?? null)
  if (nearest === null) return null
  return <WarningChip warning={nearest} />
}

function WarningChip({ warning }: { warning: BarometerWarning }) {
  const anchor = useMemo(() => tileCentreOf(warning.tile), [warning.tile])
  return (
    <OverlayCard anchor={anchor}>
      <span
        className={styles.chip}
        data-testid={SENSING_TEST_IDS.barometer}
        data-hazard={warning.hazard}
        data-cells-ahead={warning.cellsAhead}
      >
        {barometerTextOf(warning)}
      </span>
    </OverlayCard>
  )
}
