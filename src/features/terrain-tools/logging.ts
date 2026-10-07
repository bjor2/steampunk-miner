/**
 * The terrain lane's lines (#162 section 2.4: the envelope carries planet, depth and tick). Every
 * use is already `power-up-core.power_up_used`; these add what it did to the ground:
 * `terrain_edit {itemId, mark, origin, cellsChanged, chunksTouched, editHash}` for each queued edit
 * (with the TD's `chunksTouched`, #162 section 3 rule 7), and where a lodestone beacon was planted.
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
}
