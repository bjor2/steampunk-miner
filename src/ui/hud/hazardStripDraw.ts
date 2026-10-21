/**
 * Writes the hazard strip's frame onto its elements (ticket 341): the turn that lays the strip
 * along the drive, on a phone the shift that moves it out of the shaft to the edge (ticket 685), and each pip slot's kind, place, label and, for an ore pip of a seen species,
 * its rarity (ticket 454). The pips change every frame, so they are written on the elements, never
 * through React; a label is rewritten only when its text changes.
 */
import { cameraPresence } from '../../scene/cameraPresence'
import { drillPresence } from '../../scene/drillPresence'
import { hazardStripPresence } from '../../scene/hazardStripPresence'
import type { StripPip } from '../../systems/render/hazardStrip/stripPips'
import { NO_SEEN_LEAD } from '../../systems/render/kindLookTable'
import { rarityOfLead } from '../../systems/render/seenRarity'
import { rarityNameOf, type RarityName } from '../../systems/views/rarityName'
import { layoutKindOf } from '../../systems/views/designSystem'
import {
  hazardStripEdgeShiftInto,
  type HazardStripShift,
} from '../../systems/views/hazardStripPlace'
import {
  driveScreenAngle,
  stripMetresLabel,
  stripSecondsLabel,
} from '../../systems/views/hazardStripView'
import { readFittedScreen } from '../stage/screenFit'

const DEGREES_PER_RADIAN = 180 / Math.PI
const NO_SHIFT: HazardStripShift = { x: 0, y: 0 }

/** The phone's edge shift, rewritten each frame so no frame allocates. */
const EDGE_SHIFT: HazardStripShift = { x: 0, y: 0 }

/** Each lead's rarity, read from the look provider the first time a pip names it, so no frame allocates. */
const PIP_RARITIES = new Map<number, RarityName | null>()

/** The strip's pip slots, found once when it mounts. */
export function pipSlotsOf(strip: HTMLElement): HTMLElement[] {
  return Array.from(strip.querySelectorAll<HTMLElement>('[data-slot]'))
}

export function drawHazardStrip(strip: HTMLElement, slots: readonly HTMLElement[]): void {
  const { pips, pipCount, tier, isSampling } = hazardStripPresence
  const angle = driveAngleNow()
  strip.hidden = !isSampling
  strip.dataset.tier = String(tier)
  strip.style.setProperty('--strip-turn', `${-angle * DEGREES_PER_RADIAN}deg`)
  drawEdgeShift(strip, angle)
  slots.forEach((slot, index) => drawPipSlot(slot, index < pipCount ? pips[index] : null))
}

/** The drive's screen angle, counter-clockwise from screen up; CSS turns the other way. */
function driveAngleNow(): number {
  return driveScreenAngle(cameraPresence.localUpScreenAngle, drillPresence.up, drillPresence.ahead)
}

/** Ticket 685: on a phone the track slides out of the shaft to the screen's edge. */
function drawEdgeShift(strip: HTMLElement, angle: number): void {
  const fitted = readFittedScreen()
  const isPhone = fitted !== null && layoutKindOf(fitted.hudDensity) === 'phone'
  if (isPhone) hazardStripEdgeShiftInto(EDGE_SHIFT, fitted.stage, angle)
  else Object.assign(EDGE_SHIFT, NO_SHIFT)
  strip.dataset.edge = isPhone ? 'true' : 'false'
  strip.style.setProperty('--strip-shift-x', `${EDGE_SHIFT.x}px`)
  strip.style.setProperty('--strip-shift-y', `${EDGE_SHIFT.y}px`)
}

function drawPipSlot(slot: HTMLElement, pip: StripPip | null): void {
  slot.hidden = pip === null
  if (pip === null) return
  slot.dataset.kind = pip.kind
  slot.dataset.gateKind = pip.gateKind < 0 ? '' : String(pip.gateKind)
  slot.dataset.coarse = pip.isCoarse ? 'true' : 'false'
  slot.style.setProperty('--pip-place', pip.place.toFixed(3))
  drawPipRarity(slot, pipRarityOf(pip.rarityLead))
  const label = `${stripMetresLabel(pip.metres)} · ${stripSecondsLabel(pip.seconds)}`
  if (slot.textContent !== label) slot.textContent = label
}

/** A pip has no pulse, so its rarity is drawn as with reduce motion: a static rim. */
function pipRarityOf(lead: number): RarityName | null {
  if (lead === NO_SEEN_LEAD) return null
  if (!PIP_RARITIES.has(lead)) PIP_RARITIES.set(lead, rarityNameOf(rarityOfLead(lead), true))
  return PIP_RARITIES.get(lead) ?? null
}

function drawPipRarity(slot: HTMLElement, rarity: RarityName | null): void {
  const tint = rarity?.tint ?? null
  slot.dataset.rarity = rarity?.rarity ?? ''
  if (tint === null) {
    delete slot.dataset.rarityTinted
    return
  }
  slot.dataset.rarityTinted = 'true'
  slot.style.setProperty('--pip-rarity-tint', tint)
}
