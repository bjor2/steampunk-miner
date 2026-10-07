/**
 * The tier-0 "NEW MATERIAL" plaque (#172 §2) in the HUD's banner slot: under the banner in the
 * top band, in the bottom band while the vehicle lifts at speed. It comes in, holds and fades on
 * the authority's clock and never takes a click. Reads only the popup store and the local vehicle.
 */
import { useMemo } from 'react'
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import { useMiningPopupStore } from '../store/miningPopupStore'
import { localMotionOf } from '../systems/miningMoments'
import { plaquePhaseAt, plaqueShownAt, type MaterialPlaque } from '../systems/plaqueBoard'
import { plaqueTextOf } from '../systems/popupText'
import { plaqueBandOf, type PlaqueBand } from '../systems/render/chipPlacement'
import { OreIcon } from './OreIcon'
import { MINING_POPUP_TEST_IDS } from './testIds'
import { usePopupClock } from './usePopupClock'
import { usePopupFeed } from './usePopupFeed'
import styles from './NewMaterialPlaque.module.css'

export function NewMaterialPlaque() {
  usePopupFeed(useMiningPopupStore((state) => state.observeDiscoveries))
  const board = useMiningPopupStore((state) => state.plaqueBoard)
  const tick = useMiningPopupStore((state) => state.tick)
  const plaque = useMemo(() => plaqueShownAt(board, tick), [board, tick])
  const band = useLocalPlaqueBand()
  usePopupClock(plaque !== null)
  if (plaque === null) return null
  return <NewMaterialPlaqueView plaque={plaque} tick={tick} band={band} />
}

/** Re-read each time the clock ages the board, ten times a second. */
function useLocalPlaqueBand(): PlaqueBand {
  const playerId = useGameStore((state) => state.playerId)
  return plaqueBandOf(localMotionOf(readAuthorityState(), playerId))
}

function NewMaterialPlaqueView({
  plaque,
  tick,
  band,
}: {
  plaque: MaterialPlaque
  tick: number
  band: PlaqueBand
}) {
  const text = plaqueTextOf(plaque)
  return (
    <div
      className={styles.plaque}
      role="status"
      data-testid={MINING_POPUP_TEST_IDS.plaque}
      data-band={band}
      data-phase={plaquePhaseAt(plaque, tick)}
      data-materials={plaque.materials.length}
    >
      <OreIcon face={plaque.materials[0].face} size="tile" />
      <span className={styles.lines}>
        <span className={styles.title}>{text.title}</span>
        <strong className={styles.name}>{text.name}</strong>
        <span className={styles.detail}>{text.detail}</span>
        <span className={styles.price}>{text.price}</span>
        {text.joined.map(({ face }) => (
          <span key={face.oreId} className={styles.joined}>
            <OreIcon face={face} size="chip" />
            {face.name}
          </span>
        ))}
      </span>
    </div>
  )
}
