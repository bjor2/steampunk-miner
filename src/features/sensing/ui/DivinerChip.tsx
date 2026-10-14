/**
 * The Diviner fork branch's warning (ticket 269): one chip over the first warned cell of its
 * cone, a collapse before an enemy, nearest the rig first. Draws nothing while the Diviner is not
 * the active branch or its cone holds no warning. Reads only the sensing store.
 */
import { useMemo } from 'react'
import { OverlayCard } from '../../../ui/overlay/OverlayCard'
import type { DivinerWarning } from '../systems/divinerCone'
import { divinerTextOf } from '../systems/render/passiveText'
import { useSensingStore } from '../store/sensingStore'
import { tileCentreOf } from './tileCentre'
import { SENSING_TEST_IDS } from './testIds'
import styles from './DivinerChip.module.css'

export function DivinerChip() {
  const first = useSensingStore((state) => state.passives.diviner?.[0] ?? null)
  if (first === null) return null
  return <WarningChip warning={first} />
}

function WarningChip({ warning }: { warning: DivinerWarning }) {
  const anchor = useMemo(() => tileCentreOf(warning.tile), [warning.tile])
  return (
    <OverlayCard anchor={anchor}>
      <span
        className={styles.chip}
        data-testid={SENSING_TEST_IDS.diviner}
        data-warning={warning.kind}
      >
        {divinerTextOf(warning)}
      </span>
    </OverlayCard>
  )
}
