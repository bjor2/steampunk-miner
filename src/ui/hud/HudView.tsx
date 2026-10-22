/**
 * The in-run HUD drawn from its view model (#33 section 5; the strip of ticket 684); markup only.
 * The strip is the one always-on top box, the edge gauge sits in the right edge lane and the tool
 * slot bar (ticket 691) holds the tools and the gear button that opens the strip's detail. The
 * warning glow (ticket 685) lies along the screen's edges under every other part, with a hit's
 * red edge flash (ticket 720) just above it. Each kernel
 * slot is followed by its slice panels
 * (feature-slices.md 3.14): `gauges`, `banner` and `position` keep their order after the strip,
 * so a slice's own panel still lays itself out. The overlay layer (#208) comes first, so every
 * other slot draws above it, and option B's pop badges (ticket 616) right after it. The density
 * (#500) is the layout shell's. Held upright (#486) the threats are chips leading the prompts'
 * row, and the slices' threat and prompt panels join that row instead of floating over the view.
 */
import { gaugeClusterOf } from '../../systems/views/gaugeCluster'
import { isUprightCompactHud, statusIconsMaxOf } from '../../systems/views/hudCompact'
import type { HudModel } from '../../systems/views/hudModel'
import { hudStripOf } from '../../systems/views/hudStrip'
import type { HudDensity, StageOrientation } from '../../systems/views/screenLayout'
import { NO_EDGE_GLOW, type EdgeGlow } from '../../systems/views/warningWatch'
import { DebugRunMark } from './DebugRunMark'
import { EdgeGauge } from './EdgeGauge'
import { HazardStrip } from './HazardStrip'
import { HitEdgeFlash } from './HitEdgeFlash'
import { HudDetail } from './HudDetail'
import { HudStrip } from './HudStrip'
import { OverlayLayer } from '../overlay/OverlayLayer'
import { ToolSlotBar } from '../toolSlots/ToolSlotBar'
import { layoutKindOf } from '../../systems/views/designSystem'
import { HudPrompts } from './HudPrompts'
import { PopBadges } from './PopBadges'
import { SlicePanels } from './SlicePanels'
import { ThreatChips } from './ThreatChips'
import { ThreatMarkers } from './ThreatMarkers'
import { WarningGlow } from './WarningGlow'
import styles from './Hud.module.css'

export function HudView({
  model,
  isFlashing,
  density = 'full',
  orientation = 'landscape',
  isDetailOpen = false,
  isLeftHanded = false,
  isOverTouchSurface = false,
  glow = NO_EDGE_GLOW,
}: {
  model: HudModel
  isFlashing: boolean
  density?: HudDensity
  orientation?: StageOrientation
  isDetailOpen?: boolean
  isLeftHanded?: boolean
  /** The gear and its detail rise over the touch gesture surface while it lies over the HUD. */
  isOverTouchSurface?: boolean
  /** The warning layer's edge glow (ticket 685). */
  glow?: EdgeGlow
}) {
  const isUpright = isUprightCompactHud(density, orientation)
  const strip = hudStripOf(model)
  const cluster = gaugeClusterOf(model, layoutKindOf(density))
  return (
    <div className={styles.hud} data-density={density}>
      <OverlayLayer />
      <WarningGlow glow={glow} isFlashing={isFlashing} />
      <HitEdgeFlash />
      <PopBadges />
      <HudStrip
        strip={strip}
        cluster={cluster}
        model={model}
        isFlashing={isFlashing}
        statusIconsMax={statusIconsMaxOf(density)}
      />
      <div className={styles.gaugePanels} data-over-cluster={isOverTouchSurface || undefined}>
        <SlicePanels slot="gauges" />
      </div>
      <SlicePanels slot="banner" />
      <SlicePanels slot="position" />
      <EdgeGauge permille={strip.edgePermille} />
      {isUpright ? <UprightAlerts model={model} /> : <EdgeAlerts model={model} />}
      <HazardStrip />
      {model.isDebugRun && <DebugRunMark />}
      <ToolSlotBar
        kind={layoutKindOf(density)}
        isDetailOpen={isDetailOpen}
        isLeftHanded={isLeftHanded}
        isRaised={isOverTouchSurface}
      />
      {isDetailOpen && (
        <HudDetail
          model={model}
          isFlashing={isFlashing}
          isLeftHanded={isLeftHanded}
          isRaised={isOverTouchSurface}
        />
      )}
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
