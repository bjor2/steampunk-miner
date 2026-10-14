/**
 * When the magnet fields are written again (TD ruling on #286 Q1): only when a field changed, never
 * on a frame or tick alone. A frame compares what the fields are read from, with no allocation:
 * each player's beacon and pinned set by reference (the authority state is never mutated), the
 * collapse list a clamp's struts read, the heard gathers and waves, the planet, and the view's
 * chunk (it orders other players' fields). A heard field or a clamp coming to its end rebuilds on
 * that tick, so ended fields leave the cap. In between, only the layer's clock uniforms move.
 */
import type { AuthorityState } from '../../../../systems/authority/authorityState'
import type { CollapsingBlock } from '../../../../systems/authority/collapse/collapseState'
import type { MetrePoint } from '../../../../systems/render/gunLook'
import { chunkOfTile, type TilePoint } from '../../../../systems/world/tileGrid'
import { terrainToolsOf, type LodestoneBeacon } from '../terrainSection'
import { forgetEndedFields, forgetHeardFields, type HeardMagnetFields } from './heardMagnetFields'
import { writeMagnetFields, type MagnetFieldBuffer } from './magnetFieldBuffer'
import { magnetFieldsOf, NEVER_TICK, type MagnetField } from './magnetFields'

/** What the last rebuild read its fields from. */
export interface MagnetFieldWatch {
  planet: AuthorityState['planet'] | null
  localPlayerId: string
  heardVersion: number
  collapseBlocks: readonly CollapsingBlock[] | null
  beacons: Map<string, LodestoneBeacon | null>
  pinnedSets: Map<string, readonly TilePoint[] | undefined>
  viewChunkX: number
  viewChunkY: number
  /** The first tick a written field ends on. */
  nextEndTick: number
}

/** The frame's inputs: the authority state, the local player and where the view is. */
export interface MagnetFieldFrame {
  state: AuthorityState
  localPlayerId: string
  view: MetrePoint
}

export function createMagnetFieldWatch(): MagnetFieldWatch {
  return {
    planet: null,
    localPlayerId: '',
    heardVersion: -1,
    collapseBlocks: null,
    beacons: new Map(),
    pinnedSets: new Map(),
    viewChunkX: 0,
    viewChunkY: 0,
    nextEndTick: NEVER_TICK,
  }
}

/** Writes the fields again when one changed; whether it did. */
export function refreshMagnetFields(
  buffer: MagnetFieldBuffer,
  heard: HeardMagnetFields,
  watch: MagnetFieldWatch,
  frame: MagnetFieldFrame,
): boolean {
  if (!hasFieldInputChanged(watch, heard, frame)) return false
  rebuildMagnetFields(buffer, heard, watch, frame)
  return true
}

function rebuildMagnetFields(
  buffer: MagnetFieldBuffer,
  heard: HeardMagnetFields,
  watch: MagnetFieldWatch,
  frame: MagnetFieldFrame,
): void {
  forgetHeardOfOtherPlanet(heard, watch, frame.state)
  forgetEndedFields(heard, frame.state.tick)
  const fields = magnetFieldsOf(frame.state, heard.fields, frame.localPlayerId, frame.view)
  writeMagnetFields(buffer, fields, frame.state.tick)
  adoptFieldInputs(watch, heard, frame, fields)
}

function forgetHeardOfOtherPlanet(
  heard: HeardMagnetFields,
  watch: MagnetFieldWatch,
  state: AuthorityState,
): void {
  if (watch.planet !== null && watch.planet !== state.planet) forgetHeardFields(heard)
}

export function hasFieldInputChanged(
  watch: MagnetFieldWatch,
  heard: HeardMagnetFields,
  frame: MagnetFieldFrame,
): boolean {
  const { state } = frame
  return (
    state.tick >= watch.nextEndTick ||
    watch.heardVersion !== heard.version ||
    watch.planet !== state.planet ||
    watch.localPlayerId !== frame.localPlayerId ||
    watch.collapseBlocks !== state.collapse.blocks ||
    hasViewChangedChunk(watch, frame.view) ||
    hasStandingFieldChanged(watch, state)
  )
}

function hasViewChangedChunk(watch: MagnetFieldWatch, view: MetrePoint): boolean {
  return (
    watch.viewChunkX !== chunkOfTile(Math.floor(view.x)) ||
    watch.viewChunkY !== chunkOfTile(Math.floor(view.y))
  )
}

/** A beacon or a pinned set came, went or moved, or a player joined or left. */
function hasStandingFieldChanged(watch: MagnetFieldWatch, state: AuthorityState): boolean {
  let players = 0
  for (const playerId in state.players) {
    players += 1
    const tools = terrainToolsOf(state, playerId)
    if (watch.beacons.get(playerId) !== tools.beacon) return true
    if (watch.pinnedSets.get(playerId) !== tools.clamp?.cells) return true
  }
  return players !== watch.beacons.size
}

function adoptFieldInputs(
  watch: MagnetFieldWatch,
  heard: HeardMagnetFields,
  frame: MagnetFieldFrame,
  fields: readonly MagnetField[],
): void {
  const { state } = frame
  watch.planet = state.planet
  watch.localPlayerId = frame.localPlayerId
  watch.heardVersion = heard.version
  watch.collapseBlocks = state.collapse.blocks
  watch.viewChunkX = chunkOfTile(Math.floor(frame.view.x))
  watch.viewChunkY = chunkOfTile(Math.floor(frame.view.y))
  watch.nextEndTick = nextEndTickOf(fields, state.tick)
  adoptStandingFields(watch, state)
}

/** The first end still to come, so a field the state still holds past its end never loops. */
function nextEndTickOf(fields: readonly MagnetField[], tick: number): number {
  const ends = fields.map((field) => field.timing.endTick).filter((end) => end > tick)
  return Math.min(NEVER_TICK, ...ends)
}

function adoptStandingFields(watch: MagnetFieldWatch, state: AuthorityState): void {
  watch.beacons.clear()
  watch.pinnedSets.clear()
  for (const playerId of Object.keys(state.players)) {
    const tools = terrainToolsOf(state, playerId)
    watch.beacons.set(playerId, tools.beacon)
    watch.pinnedSets.set(playerId, tools.clamp?.cells)
  }
}
