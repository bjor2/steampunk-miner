/** The in-run HUD drawn from its view model (#33 section 5); markup only. */
import type { HudModel } from '../../systems/views/hudModel'
import { GaugeCluster } from './GaugeCluster'
import { HudBanner } from './HudBanner'
import { HudPrompts } from './HudPrompts'
import { PositionPanel } from './PositionPanel'
import { ThreatMarkers } from './ThreatMarkers'
import styles from './Hud.module.css'

export function HudView({ model, isFlashing }: { model: HudModel; isFlashing: boolean }) {
  return (
    <div className={styles.hud}>
      <GaugeCluster model={model} />
      <HudBanner model={model} isFlashing={isFlashing} />
      <PositionPanel model={model} />
      <HudPrompts model={model} />
      <ThreatMarkers threats={model.threats} />
    </div>
  )
}
