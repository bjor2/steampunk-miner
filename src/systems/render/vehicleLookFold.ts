/**
 * The look the local vehicle wears this frame (ticket 389, `vehicleLooks`): every source's answer
 * for the player at the tick, then each flash still playing, folded into one kept look written in
 * place, so a frame allocates nothing. The first tint and outline win (sources by id, then
 * flashes), the most see-through opacity wins, and every glow is kept. A flash plays from the tick
 * its event is heard for its own ticks; a source's next flash replaces the one it is playing.
 *
 * Under reduced effects (#33's `flashes` switch off, as the sell burst reads it) the caller swaps
 * the wash and the see-through body for one outline (G&V on #261): the outline a look asked for,
 * else the tint's colour, so a phase still reads, without the flash of colour. Presentation only.
 */
import type { AuthorityState } from '../authority/authorityState'
import type { DomainEvent } from '../authority/domainEvent'
import {
  vehicleLookSources,
  type PartGlow,
  type VehicleLook,
  type VehicleLookFlash,
} from '../registries/vehicleLooks'

export interface DrawnVehicleLook {
  tint: string | null
  opacity: number
  outline: string | null
  glows: PartGlow[]
}

/** Whose vehicle, in which state, at which authority tick. */
export interface VehicleLookMoment {
  state: AuthorityState
  playerId: string
  tick: number
}

interface PlayingFlash {
  sourceId: string
  flash: VehicleLookFlash
  startTick: number
}

/** The flashes playing, at most one per source. */
export type LookFlashes = PlayingFlash[]

const SOLID = 1

export function createDrawnVehicleLook(): DrawnVehicleLook {
  return { tint: null, opacity: SOLID, outline: null, glows: [] }
}

export function createLookFlashes(): LookFlashes {
  return []
}

/** Starts the flash each source plays for each of `playerId`'s events in the batch. */
export function startLookFlashes(
  flashes: LookFlashes,
  events: readonly DomainEvent[],
  playerId: string,
  tick: number,
): void {
  for (const event of events) {
    if (isForPlayer(event, playerId)) startFlashesOfEvent(flashes, event, tick)
  }
}

/** Rewrites `drawn` with the sources' looks at the moment, then the flashes still playing. */
export function drawVehicleLookAt(
  drawn: DrawnVehicleLook,
  flashes: LookFlashes,
  moment: VehicleLookMoment,
): void {
  clearLook(drawn)
  addSourceLooks(drawn, moment)
  addFlashLooks(drawn, flashes, moment.tick)
}

/** Reduced effects: no wash and no see-through body, one outline in their stead. */
export function swapVeilForOutline(drawn: DrawnVehicleLook): void {
  if (isVeiled(drawn)) drawn.outline = drawn.outline ?? drawn.tint
  drawn.tint = null
  drawn.opacity = SOLID
}

function isForPlayer(event: DomainEvent, playerId: string): boolean {
  return event.playerId === undefined || event.playerId === playerId
}

function startFlashesOfEvent(flashes: LookFlashes, event: DomainEvent, tick: number): void {
  for (const source of vehicleLookSources()) {
    const flash = source.flashOf(event)
    if (flash !== null) playFlash(flashes, { sourceId: source.id, flash, startTick: tick })
  }
}

function playFlash(flashes: LookFlashes, playing: PlayingFlash): void {
  const at = flashes.findIndex((kept) => kept.sourceId === playing.sourceId)
  if (at === -1) flashes.push(playing)
  else flashes[at] = playing
}

function clearLook(drawn: DrawnVehicleLook): void {
  drawn.tint = null
  drawn.opacity = SOLID
  drawn.outline = null
  drawn.glows.length = 0
}

function addSourceLooks(drawn: DrawnVehicleLook, { state, playerId, tick }: VehicleLookMoment) {
  for (const source of vehicleLookSources()) addLook(drawn, source.lookOf(state, playerId, tick))
}

/** Backwards, so a flash that has ended (or lies ahead of a restored tick) is dropped in place. */
function addFlashLooks(drawn: DrawnVehicleLook, flashes: LookFlashes, tick: number): void {
  for (let at = flashes.length - 1; at >= 0; at--) {
    const age = tick - flashes[at].startTick
    if (isPlayingAt(flashes[at].flash, age)) addLook(drawn, flashes[at].flash.lookAt(age))
    else flashes.splice(at, 1)
  }
}

function isPlayingAt(flash: VehicleLookFlash, age: number): boolean {
  return age >= 0 && age < flash.ticks
}

function addLook(drawn: DrawnVehicleLook, look: VehicleLook | null): void {
  if (look === null) return
  drawn.tint = drawn.tint ?? look.tint
  drawn.opacity = Math.min(drawn.opacity, look.opacity)
  drawn.outline = drawn.outline ?? look.outline
  for (const glow of look.glows) drawn.glows.push(glow)
}

function isVeiled(drawn: DrawnVehicleLook): boolean {
  return drawn.tint !== null || drawn.opacity < SOLID
}
