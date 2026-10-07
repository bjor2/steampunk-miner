/**
 * The Upgrade bay as a showcase (#180 sections 1 and 2; the GD's "the rig is the hero"): the bay
 * header on top, the car in the middle with nothing over it, the six track plaques beside it on
 * the side its part sits, each with a leader line to its part, and the bay's other rows and the
 * footer below. Registered as the `upgrade` bay's screen, drawn over the scene in place of the
 * kernel's menu (`bayScreens`, K-b ticket 227). Markup only.
 */
import type { CSSProperties } from 'react'
import { useGameStore } from '../../../store/gameStore'
import { readUpgradeBayModel } from '../../../store/screenReads'
import { focusOnScreen } from '../../../systems/views/menuFocus'
import { upgradeBayStartFocus, type UpgradeBayModel } from '../../../systems/views/upgradeBayModel'
import { UI_IDS } from '../../../ui/ids'
import { BayFooter } from '../../../ui/platform/BayFooter'
import { BayHeader } from '../../../ui/platform/BayHeader'
import { useScreenModel } from '../../../ui/useScreenModel'
import { rowsOnSide, type PlaqueSide } from '../systems/plaqueReading'
import { LeaderLines } from './LeaderLines'
import { ServiceRows } from './ServiceRows'
import { TrackPlaque } from './TrackPlaque'
import { WORKSHOP_TEST_IDS } from './testIds'
import { useShowcaseClock } from './useShowcaseClock'
import styles from './ShowcaseScreen.module.css'

/** The layout's `--shop-text`, as the kernel's bay frame sets it (`BayFrame`). */
const SHOP_TYPE = { fontSize: 'var(--shop-text)', '--kit-label-size': '1em' } as CSSProperties

export function ShowcaseScreen() {
  const model = useScreenModel(readUpgradeBayModel)
  const focusedId = useUpgradeBayFocus(model)
  useShowcaseClock()
  return <ShowcaseView model={model} focusedId={focusedId} />
}

/** The showcase's markup for a bay model and the resolved menu focus. */
export function ShowcaseView({ model, focusedId }: { model: UpgradeBayModel; focusedId: string }) {
  return (
    <div
      className={styles.showcase}
      style={SHOP_TYPE}
      data-testid={UI_IDS.platformScreen}
      data-bay={model.header.bay}
      data-accent={model.header.accent}
    >
      <div className={styles.band}>
        <BayHeader header={model.header} />
      </div>
      <div className={styles.stage} data-testid={UI_IDS.upgradebayScreen}>
        <PlaqueColumn side="rear" model={model} focusedId={focusedId} />
        <div className={styles.car} data-testid={WORKSHOP_TEST_IDS.showcase} />
        <PlaqueColumn side="front" model={model} focusedId={focusedId} />
        <LeaderLines />
      </div>
      <div className={styles.band}>
        <ServiceRows model={model} focusedId={focusedId} />
        <BayFooter footer={model.footer} focusedId={focusedId} />
      </div>
    </div>
  )
}

function PlaqueColumn({
  side,
  model,
  focusedId,
}: {
  side: PlaqueSide
  model: UpgradeBayModel
  focusedId: string
}) {
  return (
    <div className={styles.column} data-side={side}>
      {rowsOnSide(model.tracks, side).map((row) => (
        <TrackPlaque
          key={row.upgradeId}
          row={row}
          focusedId={focusedId}
          moneyIconId={model.header.moneyIconId}
        />
      ))}
    </div>
  )
}

function useUpgradeBayFocus(model: UpgradeBayModel): string {
  const focusedControlId = useGameStore((state) => state.focusedControlId)
  return focusOnScreen(model.focusStops, focusedControlId, upgradeBayStartFocus(model))
}
