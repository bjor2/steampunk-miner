/**
 * The HUD overlay's resource chips (#172 §1): each chip is an overlay card riding beside the
 * vehicle, away from where it is going, rising as it shows and fading at the end of its life.
 * Reads only the popup store; the cards place themselves every frame (#208).
 */
import { useMemo } from 'react'
import { OverlayCard } from '../../../ui/overlay/OverlayCard'
import { useMiningPopupStore } from '../store/miningPopupStore'
import { chipPhaseAt, chipsShownAt, type ResourceChip } from '../systems/chipBoard'
import { chipCountTextOf } from '../systems/popupText'
import { chipAnchorOf } from './chipAnchor'
import { MINING_POPUP_TEST_IDS } from './testIds'
import { OreIcon } from './OreIcon'
import { usePopupClock } from './usePopupClock'
import { usePopupFeed } from './usePopupFeed'
import styles from './ResourceChips.module.css'

export function ResourceChips() {
  usePopupFeed(useMiningPopupStore((state) => state.observePickups))
  const board = useMiningPopupStore((state) => state.chipBoard)
  const tick = useMiningPopupStore((state) => state.tick)
  const chips = useMemo(() => chipsShownAt(board, tick), [board, tick])
  usePopupClock(chips.length > 0)
  return (
    <>
      {chips.map((chip) => (
        <ChipCard key={chip.serial} chip={chip} tick={tick} />
      ))}
    </>
  )
}

function ChipCard({ chip, tick }: { chip: ResourceChip; tick: number }) {
  const { away, slot } = chip
  const anchor = useMemo(() => chipAnchorOf(away, slot), [away, slot])
  return (
    <OverlayCard anchor={anchor}>
      <span
        className={styles.chip}
        data-testid={MINING_POPUP_TEST_IDS.chip}
        data-ore={chip.face.oreId}
        data-count={chip.count}
        data-phase={chipPhaseAt(chip, tick)}
      >
        <OreIcon face={chip.face} size="chip" />
        {chip.isNamed && <span className={styles.name}>{chip.face.name}</span>}
        <span key={chip.count} className={styles.count}>
          {chipCountTextOf(chip.count)}
        </span>
      </span>
    </OverlayCard>
  )
}
