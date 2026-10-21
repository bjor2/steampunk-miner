/**
 * The in-run HUD drawn from its view model (#33 section 5); markup only. Each kernel component is
 * followed by its slot's slice panels (feature-slices.md 3.14). The overlay layer (#208) comes
 * first, so every other slot draws above it, and option B's pop badges (ticket 616) right after
 * it. The density (#500) is the layout shell's: `compact` lays the gauges, the status row and the
 * readouts out as rows on a phone, the same components.
 * Held upright (#486) the threats are chips leading the prompts' row, and the slices' threat and
 * prompt panels join that row instead of floating over the view.
 */
import { isUprightCompactHud } from '../../systems/views/hudCompact'
import type { HudModel } from '../../systems/views/hudModel'
import type { HudDensity, StageOrientation } from '../../systems/views/screenLayout'
import { GaugeCluster } from './GaugeCluster'
import { HazardStrip } from './HazardStrip'
import { HudBanner } from './HudBanner'
import { OverlayLayer } from '../overlay/OverlayLayer'
import { HudPrompts } from './HudPrompts'
import { PopBadges } from './PopBadges'
import { PositionPanel } from './PositionPanel'
import { SlicePanels } from './SlicePanels'
import { ThreatChips } from './ThreatChips'
import { ThreatMarkers } from './ThreatMarkers'
import styles from './Hud.module.css'

export function HudView({
  model,
  isFlashing,
  density = 'full',
  orientation = 'landscape',
}: {
  model: HudModel
  isFlashing: boolean
  density?: HudDensity
  orientation?: StageOrientation
}) {
  const isUpright = isUprightCompactHud(density, orientation)
  return (
    <div className={styles.hud} data-density={density}>
      <OverlayLayer />
      <PopBadges />
      <GaugeCluster model={model} density={density} />
      <SlicePanels slot="gauges" />
      <HudBanner model={model} isFlashing={isFlashing} density={density} />
      <SlicePanels slot="banner" />
      <PositionPanel model={model} density={density} />
      <SlicePanels slot="position" />
      {isUpright ? <UprightAlerts model={model} /> : <EdgeAlerts model={model} />}
      <HazardStrip />
    </div>
  )
}

/** The prompts at the bottom centre and the threats at the screen's edge, each slot after its own. */
function EdgeAlerts({ model }: { model: HudModel }) {
  return (
    <>
      <HudPrompts model={model} />
      <SlicePanels slot="prompts" />
      <ThreatMarkers threats={model.threats} />
      <SlicePanels slot="threats" />
    </>
  )
}

/** Held upright: one row of chips, the threats first, then the slices' panels and the prompts. */
function UprightAlerts({ model }: { model: HudModel }) {
  return (
    <HudPrompts model={model}>
      <ThreatChips threats={model.threats} />
      <SlicePanels slot="threats" />
      <SlicePanels slot="prompts" />
    </HudPrompts>
  )
}
