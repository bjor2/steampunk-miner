/**
 * Writes the hazard strip's frame onto its elements (ticket 341): the turn that lays the strip
 * along the drive, on a phone the shift that moves it out of the shaft to the edge (ticket 685), on
 * desktop the reach that keeps it inside the play area (ticket 769), and each pip slot's kind,
 * place, label and, for an ore pip of a seen species, its rarity (ticket 454). The pips change every frame, so they are written on the elements, never
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
import { hazardStripDesktopReachInto } from '../../systems/views/hazardStripFit'
import {
  hazardStripEdgeShiftInto,
  hazardStripStyleOf,
  type HazardStripReach,
  type HazardStripShift,
} from '../../systems/views/hazardStripPlace'
import type { ScreenSize } from '../../systems/views/hudClearView'
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

/** Desktop's fitted reach and the HUD box it is fitted to, rewritten each frame. */
const DESKTOP_REACH: HazardStripReach = { inner: 0, length: 0 }
const HUD_BOX: ScreenSize = { width: 0, height: 0 }

/** A phone's track keeps the screen's reach in `vmin`, as the strip mounted with. */
const PHONE_REACH = hazardStripStyleOf()

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
  const isPhone = isPhoneLayoutNow()
  drawEdgeShift(strip, angle, isPhone)
  drawReach(strip, angle, isPhone)
  slots.forEach((slot, index) => drawPipSlot(slot, index < pipCount ? pips[index] : null))
}

/** The drive's screen angle, counter-clockwise from screen up; CSS turns the other way. */
function driveAngleNow(): number {
  return driveScreenAngle(cameraPresence.localUpScreenAngle, drillPresence.up, drillPresence.ahead)
}

function isPhoneLayoutNow(): boolean {
  const fitted = readFittedScreen()
  return fitted !== null && layoutKindOf(fitted.hudDensity) === 'phone'
}

/** Ticket 685: on a phone the track slides out of the shaft to the screen's edge. */
function drawEdgeShift(strip: HTMLElement, angle: number, isPhone: boolean): void {
  const fitted = readFittedScreen()
  if (isPhone && fitted !== null) hazardStripEdgeShiftInto(EDGE_SHIFT, fitted.stage, angle)
  else Object.assign(EDGE_SHIFT, NO_SHIFT)
  strip.dataset.edge = isPhone ? 'true' : 'false'
  strip.style.setProperty('--strip-shift-x', `${EDGE_SHIFT.x}px`)
  strip.style.setProperty('--strip-shift-y', `${EDGE_SHIFT.y}px`)
}

/**
 * Ticket 769: on desktop the track ends inside the play area, measured on the HUD's own box, which
 * a docked panel has already narrowed; a phone keeps the screen's reach.
 */
function drawReach(strip: HTMLElement, angle: number, isPhone: boolean): void {
  const hud = strip.parentElement
  if (isPhone || hud === null) return drawPhoneReach(strip)
  HUD_BOX.width = hud.clientWidth
  HUD_BOX.height = hud.clientHeight
  hazardStripDesktopReachInto(DESKTOP_REACH, HUD_BOX, angle)
  strip.style.setProperty('--strip-inner', `${DESKTOP_REACH.inner}px`)
  strip.style.setProperty('--strip-length', `${DESKTOP_REACH.length}px`)
}

function drawPhoneReach(strip: HTMLElement): void {
  strip.style.setProperty('--strip-inner', PHONE_REACH['--strip-inner'])
  strip.style.setProperty('--strip-length', PHONE_REACH['--strip-length'])
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
