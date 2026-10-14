/**
 * The terrain lane's lines (#162 section 2.4: the envelope carries planet, depth and tick). Every
 * use is already `power-up-core.power_up_used`; these add what it did to the ground:
 * `terrain_edit {itemId, mark, origin, cellsChanged, chunksTouched, editHash}` for each queued edit
 * (with the TD's `chunksTouched`, #162 section 3 rule 7), where a lodestone beacon was planted, and
 * `magnet_used {itemId, verb, cellsMoved, energy}` for each terrain magnet use (GD lock on #246),
 * `foam_set {mark, origin, cellsSet, untilTick}` for each spray of stabiliser foam (ticket 381), and
 * `foam_stocked {charges}` when researching foam's node stocks its first stack, and
 * `foam_cured {cellsCured, price}` when a spray at foam's cure Mark cures cells for good (ticket 368).
 */
import type { SliceEventProjections } from '../../logging/registries/eventProjections'
import type { SliceRunEvents } from '../../logging/registries/runEvents'
import './systems/terrainEvents'

export const TERRAIN_PROJECTIONS: SliceEventProjections = {
  'terrain-tools.TerrainEdited': (edited) => ({
    event: 'terrain-tools.terrain_edit',
    data: {
      itemId: edited.itemId,
      mark: edited.mark,
      origin: { tx: edited.originTx, ty: edited.originTy },
      cellsChanged: edited.cellsChanged,
      chunksTouched: edited.chunksTouched,
      editHash: edited.editHash,
    },
  }),
  'terrain-tools.BeaconPlanted': ({ tx, ty, plantedTick }) => ({
    event: 'terrain-tools.beacon_planted',
    data: { at: { tx, ty }, plantedTick },
  }),
  'terrain-tools.MagnetUsed': ({ itemId, verb, cellsMoved, energy }) => ({
    event: 'terrain-tools.magnet_used',
    data: { itemId, verb, cellsMoved, energy },
  }),
  'terrain-tools.FoamSet': ({ mark, originTx, originTy, cellsSet, untilTick }) => ({
    event: 'terrain-tools.foam_set',
    data: { mark, origin: { tx: originTx, ty: originTy }, cellsSet, untilTick },
  }),
  'terrain-tools.FoamStocked': ({ charges }) => ({
    event: 'terrain-tools.foam_stocked',
    data: { charges },
  }),
  'terrain-tools.FoamCured': ({ cellsCured, price }) => ({
    event: 'terrain-tools.foam_cured',
    data: { cellsCured, price },
  }),
}

export const TERRAIN_RUN_EVENTS: SliceRunEvents = {
  'terrain-tools.terrain_edit': {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: {
      itemId: 'text',
      mark: 'integer',
      origin: { mapOf: 'integer' },
      cellsChanged: 'integer',
      chunksTouched: 'integer',
      editHash: 'text',
    },
  },
  'terrain-tools.beacon_planted': {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: { at: { mapOf: 'integer' }, plantedTick: 'integer' },
  },
  'terrain-tools.magnet_used': {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: { itemId: 'text', verb: 'text', cellsMoved: 'integer', energy: 'integer' },
  },
  'terrain-tools.foam_set': {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: {
      mark: 'integer',
      origin: { mapOf: 'integer' },
      cellsSet: 'integer',
      untilTick: 'integer',
    },
  },
  'terrain-tools.foam_stocked': {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: { charges: 'integer' },
  },
  'terrain-tools.foam_cured': {
    group: 'mining',
    level: 'core',
    payload: { cellsCured: 'integer', price: 'money' },
  },
}
