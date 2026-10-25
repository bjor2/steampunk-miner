/**
 * The Cache Crate's log lines (ticket 823; the TD's final ruling on #823, point 8):
 * `planet-kit.container_drop` and `planet-kit.container_pickup`, each with the planet's stable id
 * (`system`, `place`: the envelope's `planet` is g), the cell, the kind, the owner, the container's
 * id, the units moved and their value. A pickup also logs what stayed in the container. A
 * scenario's placed container logs only `debug_command_applied`, so it never counts as play.
 */
import type { SliceEventProjections } from '../../logging/registries/eventProjections'
import type { SliceRunEvents } from '../../logging/registries/runEvents'
import type { ContainerMoveBody } from './systems/containerEvents'
import { countToJson } from '../../systems/wholeCount'

export const PLANET_KIT_PROJECTIONS: SliceEventProjections = {
  'planet-kit.ContainerDropped': (dropped) => ({
    event: 'planet-kit.container_drop',
    data: { ...moveDataOf(dropped), units: countToJson(dropped.units), value: dropped.value },
  }),
  'planet-kit.ContainerPickedUp': (picked) => ({
    event: 'planet-kit.container_pickup',
    data: {
      ...moveDataOf(picked),
      units: countToJson(picked.units),
      value: picked.value,
      unitsLeft: countToJson(picked.unitsLeft),
    },
  }),
}

const MOVE_FIELDS = {
  system: 'text',
  place: 'text',
  cell: { tuple: ['integer', 'integer'] },
  kind: 'text',
  ownerId: 'text',
  containerId: 'integer',
  units: 'count',
  value: 'money',
} as const

export const PLANET_KIT_RUN_EVENTS: SliceRunEvents = {
  'planet-kit.container_drop': { group: 'mining', level: 'core', payload: MOVE_FIELDS },
  'planet-kit.container_pickup': {
    group: 'mining',
    level: 'core',
    payload: { ...MOVE_FIELDS, unitsLeft: 'count' },
  },
}

function moveDataOf(body: ContainerMoveBody) {
  return {
    system: body.system,
    place: body.place,
    cell: [body.tx, body.ty],
    kind: body.kind,
    ownerId: body.ownerId,
    containerId: body.containerId,
  }
}
