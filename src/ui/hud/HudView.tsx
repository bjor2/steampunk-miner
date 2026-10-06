/**
 * The in-run HUD drawn from its view model (#33 section 5); markup only. Each kernel component is
 * followed by its slot's slice panels (feature-slices.md 3.14).
 */
import type { HudModel } from '../../systems/views/hudModel'
import { GaugeCluster } from './GaugeCluster'
import { HudBanner } from './HudBanner'
import { HudPrompts } from './HudPrompts'
import { PositionPanel } from './PositionPanel'
import { SlicePanels } from './SlicePanels'
import { ThreatMarkers } from './ThreatMarkers'
import styles from './Hud.module.css'

export function HudView({ model, isFlashing }: { model: HudModel; isFlashing: boolean }) {
  return (
    <div className={styles.hud}>
      <GaugeCluster model={model} />
      <SlicePanels slot="gauges" />
      <HudBanner model={model} isFlashing={isFlashing} />
      <SlicePanels slot="banner" />
      <PositionPanel model={model} />
      <SlicePanels slot="position" />
      <HudPrompts model={model} />
      <SlicePanels slot="prompts" />
      <ThreatMarkers threats={model.threats} />
      <SlicePanels slot="threats" />
    </div>
  )
}
