/**
 * The assay lens's cards (#162 Sensing row): over each ore cell it reads, nearest the miner first,
 * the family and grade, the rarity lead, the Sell bay's unit price and the gate it needs. Each is
 * an overlay card at the cell's centre (#208); a full overlay drops them first. Draws nothing
 * while the lens is not owned. Reads only the sensing store.
 */
import { useMemo } from 'react'
import { OverlayCard } from '../../../ui/overlay/OverlayCard'
import type { AssayReading } from '../systems/assayLens'
import { assayCardTextOf } from '../systems/render/passiveText'
import { useSensingStore } from '../store/sensingStore'
import { tileCentreOf } from './tileCentre'
import { SENSING_TEST_IDS } from './testIds'
import styles from './AssayCards.module.css'

export function AssayCards() {
  const readings = useSensingStore((state) => state.passives.lens)
  if (readings === null) return null
  return (
    <>
      {readings.map((reading) => (
        <AssayCard key={`${reading.tile.tx},${reading.tile.ty}`} reading={reading} />
      ))}
    </>
  )
}

function AssayCard({ reading }: { reading: AssayReading }) {
  const anchor = useMemo(() => tileCentreOf(reading.tile), [reading.tile])
  const text = useMemo(() => assayCardTextOf(reading), [reading])
  return (
    <OverlayCard anchor={anchor}>
      <span
        className={styles.card}
        data-testid={SENSING_TEST_IDS.assayCard}
        data-ore={reading.oreId}
        data-gate={reading.gate}
      >
        <span className={styles.title}>{text.title}</span>
        <span>{text.lead}</span>
        <span>{text.price}</span>
        {text.gate !== null && <span className={styles.gate}>{text.gate}</span>}
      </span>
    </OverlayCard>
  )
}
