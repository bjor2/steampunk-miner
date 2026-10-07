/**
 * The Upgrade bay screen (#37, #45 wire): the tracks, the Casing row and repair on the left 45%,
 * the live vehicle preview on the right 55%, and the quick action, which works at both shops
 * (#170). Markup only.
 */
import type { UpgradeBayModel } from '../../systems/views/upgradeBayModel'
import { UI_IDS } from '../ids'
import { ScreenButtonView } from '../ScreenButtonView'
import { BayFrame } from './BayFrame'
import styles from './Platform.module.css'
import { TracksPanel } from './TracksPanel'
import { VehiclePreviewPanel } from './VehiclePreviewPanel'

export function UpgradeBayView({
  model,
  focusedId,
}: {
  model: UpgradeBayModel
  focusedId: string
}) {
  return (
    <BayFrame header={model.header} footer={model.footer} focusedId={focusedId}>
      <div className={styles.upgradePanels} data-testid={UI_IDS.upgradebayScreen}>
        <TracksPanel model={model} focusedId={focusedId} />
        <VehiclePreviewPanel preview={model.preview} tierIconId={model.tierIconId} />
        <span className={styles.wideRow}>
          <ScreenButtonView button={model.quickService} focusedId={focusedId} />
        </span>
      </div>
    </BayFrame>
  )
}
