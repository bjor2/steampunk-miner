/**
 * The magnet fields only events tell of, kept by the layer that heard them (GD and TD rulings on
 * #286): a lodestone gather and a repulsor wave leave nothing in the authority state to draw from.
 *
 * - A beacon's gather is its `TerrainEdited` at the owner's dock: bright arcs on the beacon's
 *   tile, ramping up from faint over the look's `rampTicks`, shown while its swaps land (the K6
 *   queue takes `TERRAIN_EDIT_UNITS_PER_TICK` a tick), then faded out: the beacon is spent.
 * - A wave is the coil's `MagnetUsed`: a ring opening from the vehicle's tile, where the wave
 *   starts, to its radius at the Mark the same batch's `PowerUpUsed` names (the vehicle is never
 *   pushed, so its tile on hearing is the wave's).
 *
 * Bounded: at most `MAX_HEARD_FIELDS` are kept, the oldest dropped first, and an ended one is
 * forgotten at the layer's next rebuild. Presentation memory, never the authority's.
 */
import { SWAP_CELL_UNITS, TERRAIN_EDIT_UNITS_PER_TICK } from '../../../../constants/terrainBudget'
import { vehicleOf, type AuthorityState } from '../../../../systems/authority/authorityState'
import type { DomainEvent } from '../../../../systems/authority/domainEvent'
import { tileOfPose } from '../../../../systems/vehicle/vehiclePose'
import { markStepOf } from '../../../tech-tree'
import { LODESTONE_BEACON_ID } from '../lodestoneBeacon'
import { magnetBalanceOf, magnetItemOf, magnetMarkLadderOf } from '../magnetItems'
import { REPULSOR_COIL_ID } from '../repulsorCoil'
import { MAGNET_FIELD_LOOK, type MagnetFieldLook } from './magnetFieldLook'
import { gatherRadiusAt, tileCentreOf, type MagnetField, type RoundField } from './magnetFields'

/** More than any one co-op moment holds: one gather and one wave a player for four players. */
export const MAX_HEARD_FIELDS = 8

/** Mark 1 is the item as bought (#162 4.6). */
const BOUGHT_MARK = 1

export interface HeardMagnetFields {
  fields: MagnetField[]
  /** Moves on every change, so the layer knows to rebuild. */
  version: number
}

export function createHeardMagnetFields(): HeardMagnetFields {
  return { fields: [], version: 0 }
}

/** Keeps the gathers and waves in a batch of events, read against the state that answered it. */
export function hearMagnetEvents(
  heard: HeardMagnetFields,
  events: readonly DomainEvent[],
  state: AuthorityState,
  look: MagnetFieldLook = MAGNET_FIELD_LOOK,
): void {
  const fields = events
    .map((event) => heardFieldOf(event, events, state, look))
    .filter((field): field is RoundField => field !== null)
  if (fields.length === 0) return
  heard.fields = [...heard.fields, ...fields].slice(-MAX_HEARD_FIELDS)
  heard.version += 1
}

/** Forgets every field that has faded out by `tick`. */
export function forgetEndedFields(heard: HeardMagnetFields, tick: number): void {
  const live = heard.fields.filter((field) => field.timing.endTick > tick)
  if (live.length === heard.fields.length) return
  heard.fields = live
  heard.version += 1
}

/** Forgets them all: the planet changed. */
export function forgetHeardFields(heard: HeardMagnetFields): void {
  if (heard.fields.length === 0) return
  heard.fields = []
  heard.version += 1
}

function heardFieldOf(
  event: DomainEvent,
  batch: readonly DomainEvent[],
  state: AuthorityState,
  look: MagnetFieldLook,
): RoundField | null {
  if (event.type === 'terrain-tools.TerrainEdited' && event.itemId === LODESTONE_BEACON_ID)
    return gatherFieldOf(event, look)
  if (event.type === 'terrain-tools.MagnetUsed' && event.itemId === REPULSOR_COIL_ID)
    return waveFieldOf(event, batch, state, look)
  return null
}

type EventOf<T extends DomainEvent['type']> = Extract<DomainEvent, { type: T }>

function gatherFieldOf(
  edited: EventOf<'terrain-tools.TerrainEdited'>,
  look: MagnetFieldLook,
): RoundField {
  const landingTicks = Math.ceil(
    (edited.cellsChanged * SWAP_CELL_UNITS) / TERRAIN_EDIT_UNITS_PER_TICK,
  )
  return {
    kind: 'attract',
    playerId: edited.playerId,
    centre: tileCentreOf({ tx: edited.originTx, ty: edited.originTy }),
    radiusM: gatherRadiusAt(edited.mark),
    timing: {
      startTick: edited.tick,
      growTicks: 0,
      brightFromTick: edited.tick,
      endTick: edited.tick + Math.max(look.rampTicks, landingTicks) + look.fadeTicks,
    },
  }
}

function waveFieldOf(
  used: EventOf<'terrain-tools.MagnetUsed'>,
  batch: readonly DomainEvent[],
  state: AuthorityState,
  look: MagnetFieldLook,
): RoundField | null {
  const pose = vehicleOf(state, used.playerId).pose
  if (pose === null) return null
  return {
    kind: 'repel',
    playerId: used.playerId,
    centre: tileCentreOf(tileOfPose(pose)),
    radiusM: coilRadiusAt(markOfWave(used, batch)),
    timing: {
      startTick: used.tick,
      growTicks: look.repel.growTicks,
      brightFromTick: used.tick,
      endTick: used.tick + look.repel.lingerTicks,
    },
  }
}

/** The Mark the coil acted at: its `PowerUpUsed` in the same batch, else as bought. */
function markOfWave(used: EventOf<'terrain-tools.MagnetUsed'>, batch: readonly DomainEvent[]) {
  const line = batch.find(
    (event) =>
      event.type === 'power-up-core.PowerUpUsed' &&
      event.playerId === used.playerId &&
      event.itemId === REPULSOR_COIL_ID,
  )
  return line?.type === 'power-up-core.PowerUpUsed' ? line.mark : BOUGHT_MARK
}

/** The wave's radius in tiles at a Mark, as the coil's use reads it from the family ladder. */
export function coilRadiusAt(mark: number): number {
  const coil = magnetItemOf(REPULSOR_COIL_ID)
  if (coil === null) throw new RangeError(`no ${REPULSOR_COIL_ID} row`)
  const step = markStepOf(magnetMarkLadderOf(coil), Math.max(mark, BOUGHT_MARK))
  return step.stats.magnitude ?? magnetBalanceOf(coil).magnitude
}
