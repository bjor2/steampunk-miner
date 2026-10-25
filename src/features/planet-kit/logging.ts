/**
 * The planet kits' log lines. Buying a kit item (ticket 850) logs
 * `planet-kit.kit_item_purchased` with the item, its kind, the planet (s, p) and the g its price
 * was read at, the price and the units now held; a scenario's grant logs
 * `planet-kit.kit_item_granted` with the item, its home g and its price there, the run ledger's
 * debit (ticket 881) beside the grant's `debug_command_applied`. Uncorking a Damp Flask (ticket 881) logs
 * `planet-kit.flask_uncorked` with the flask's id, the g it was bought at, the tick it closes at
 * and the flasks left. The Cache Crate's (ticket 823; the TD's final
 * ruling on #823, point 8):
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
  'planet-kit.KitItemBought': (bought) => ({
    event: 'planet-kit.kit_item_purchased',
    data: {
      itemId: bought.itemId,
      kind: bought.kind,
      system: bought.system,
      place: bought.place,
      g: bought.g,
      price: bought.price,
      held: bought.held,
    },
  }),
  'planet-kit.KitItemGranted': (granted) => ({
    event: 'planet-kit.kit_item_granted',
    data: { itemId: granted.itemId, g: granted.g, price: granted.price },
  }),
  'planet-kit.FlaskUncorked': (uncorked) => ({
    event: 'planet-kit.flask_uncorked',
    data: {
      itemId: uncorked.itemId,
      g: uncorked.g,
      untilTick: uncorked.untilTick,
      left: uncorked.left,
    },
  }),
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
  'planet-kit.kit_item_purchased': {
    group: 'platform',
    level: 'core',
    payload: {
      itemId: 'text',
      kind: { oneOf: ['tool', 'consumable'] },
      system: 'text',
      place: 'text',
      g: 'text',
      price: 'money',
      held: 'text',
    },
  },
  'planet-kit.kit_item_granted': {
    group: 'platform',
    level: 'core',
    payload: { itemId: 'text', g: 'text', price: 'money' },
  },
  'planet-kit.flask_uncorked': {
    group: 'mining',
    level: 'core',
    payload: { itemId: 'text', g: 'text', untilTick: 'integer', left: 'text' },
  },
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
