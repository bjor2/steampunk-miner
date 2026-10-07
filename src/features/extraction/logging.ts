/**
 * The extraction line (#162 section 2.4): `drain_yield {itemId, value, tripCapFraction}` for every
 * use of an income item that moved ore, with the band the trip cap was read at and the cells and
 * units it took. The use itself is `power-up-core.power_up_used`; a use refused at the cap is
 * `power-up-core.power_up_refused {reason: extraction.drain_capped}`, and the envelope already
 * carries planet, depth and tick. Both amounts are canonical decimals: the run log keeps floats to
 * `perf_sample` (#11).
 */
import type { SliceEventProjections } from '../../logging/registries/eventProjections'
import type { SliceRunEvents } from '../../logging/registries/runEvents'
import './systems/extractionEvents'

export const DRAIN_YIELD_EVENT = 'extraction.drain_yield'

export const EXTRACTION_PROJECTIONS: SliceEventProjections = {
  'extraction.DrainYielded': ({ itemId, value, tripCapFraction, band, cells, units }) => ({
    event: DRAIN_YIELD_EVENT,
    data: { itemId, value, tripCapFraction, band, cells, units },
  }),
}

export const EXTRACTION_RUN_EVENTS: SliceRunEvents = {
  [DRAIN_YIELD_EVENT]: {
    group: 'mining',
    level: 'core',
    payload: {
      itemId: 'text',
      value: 'money',
      tripCapFraction: 'money',
      band: 'integer',
      cells: 'integer',
      units: 'integer',
    },
  },
}
