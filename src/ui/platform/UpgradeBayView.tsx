/**
 * The Upgrade bay screen (#37): the tracks, the Casing row and repair, the live vehicle preview,
 * and the quick action's sign pointing back at the Sell bay. Markup only.
 */
import type { UpgradeBayModel } from '../../systems/views/upgradeBayModel'
import type { UpgradePreview } from '../../systems/views/upgradePreview'
import { UI_IDS } from '../ids'
import { Panel } from '../kit/Panel'
import { ScreenButtonView } from '../ScreenButtonView'
import { BayFrame } from './BayFrame'
import styles from './Platform.module.css'
import { TracksPanel } from './TracksPanel'

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
        <VehiclePreview preview={model.preview} />
        <ScreenButtonView button={model.quickService} focusedId={focusedId} />
      </div>
    </BayFrame>
  )
}

/**
 * The live preview's hook (#37): the part the focused row changes and the visual tier after the
 * buy, as data the shop screens ticket draws the vehicle from. Presentation only.
 */
function VehiclePreview({ preview }: { preview: UpgradePreview }) {
  return (
    <Panel title="Preview">
      <div
        data-testid={UI_IDS.upgradebayPreview}
        data-highlight={preview.highlight ?? ''}
        data-visual-tier={preview.visualTier}
      >
        Tier {preview.visualTier}
        {preview.highlight !== null && ` · ${preview.highlight}`}
      </div>
    </Panel>
  )
}
