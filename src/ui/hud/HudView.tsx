/**
 * The in-run HUD drawn from its view model (#33 section 5); markup only. Each kernel component is
 * followed by its slot's slice panels (feature-slices.md 3.14). The overlay layer (#208) comes
 * first, so every other slot draws above it. The density (#500) is the layout shell's: `compact`
 * lays the gauges, the status row and the readouts out as rows on a phone, the same components.
 */
import type { HudModel } from '../../systems/views/hudModel'
import type { HudDensity } from '../../systems/views/screenLayout'
import { GaugeCluster } from './GaugeCluster'
import { HazardStrip } from './HazardStrip'
import { HudBanner } from './HudBanner'
import { OverlayLayer } from '../overlay/OverlayLayer'
import { HudPrompts } from './HudPrompts'
import { PositionPanel } from './PositionPanel'
import { SlicePanels } from './SlicePanels'
import { ThreatMarkers } from './ThreatMarkers'
import styles from './Hud.module.css'

export function HudView({
  model,
  isFlashing,
  density = 'full',
}: {
  model: HudModel
  isFlashing: boolean
  density?: HudDensity
}) {
  return (
    <div className={styles.hud} data-density={density}>
      <OverlayLayer />
      <GaugeCluster model={model} density={density} />
      <SlicePanels slot="gauges" />
      <HudBanner model={model} isFlashing={isFlashing} density={density} />
      <SlicePanels slot="banner" />
      <PositionPanel model={model} density={density} />
      <SlicePanels slot="position" />
      <HudPrompts model={model} />
      <SlicePanels slot="prompts" />
      <ThreatMarkers threats={model.threats} />
      <SlicePanels slot="threats" />
      <HazardStrip />
    </div>
  )
}
