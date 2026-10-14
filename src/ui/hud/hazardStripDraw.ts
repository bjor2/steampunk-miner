/**
 * Writes the hazard strip's frame onto its elements (ticket 341): the turn that lays the strip
 * along the drive, and each pip slot's kind, place and label. The pips change every frame, so they
 * are written on the elements, never through React; a label is rewritten only when its text
 * changes.
 */
import { cameraPresence } from '../../scene/cameraPresence'
import { drillPresence } from '../../scene/drillPresence'
import { hazardStripPresence } from '../../scene/hazardStripPresence'
import type { StripPip } from '../../systems/render/hazardStrip/stripPips'
import {
  driveScreenAngle,
  stripMetresLabel,
  stripSecondsLabel,
} from '../../systems/views/hazardStripView'

const DEGREES_PER_RADIAN = 180 / Math.PI

export function drawHazardStrip(strip: HTMLElement): void {
  const { pips, pipCount, tier, isSampling } = hazardStripPresence
  strip.hidden = !isSampling
  strip.dataset.tier = String(tier)
  strip.style.setProperty('--strip-turn', `${stripTurnDegrees()}deg`)
  const slots = strip.querySelectorAll<HTMLElement>('[data-slot]')
  slots.forEach((slot, index) => drawPipSlot(slot, index < pipCount ? pips[index] : null))
}

/** CSS turns clockwise; the drive's screen angle is counter-clockwise from screen up. */
function stripTurnDegrees(): number {
  const angle = driveScreenAngle(
    cameraPresence.localUpScreenAngle,
    drillPresence.up,
    drillPresence.ahead,
  )
  return -angle * DEGREES_PER_RADIAN
}

function drawPipSlot(slot: HTMLElement, pip: StripPip | null): void {
  slot.hidden = pip === null
  if (pip === null) return
  slot.dataset.kind = pip.kind
  slot.dataset.gateKind = pip.gateKind < 0 ? '' : String(pip.gateKind)
  slot.dataset.coarse = pip.isCoarse ? 'true' : 'false'
  slot.style.setProperty('--pip-place', pip.place.toFixed(3))
  const label = `${stripMetresLabel(pip.metres)} · ${stripSecondsLabel(pip.seconds)}`
  if (slot.textContent !== label) slot.textContent = label
}
