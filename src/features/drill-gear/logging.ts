/**
 * The drill-gear log lines (design 37.5, feature-slices.md 3.15): the vibratory bit's crumble, the
 * spoil auger's backfill and the corer's plug, each naming its tile. A use, a toggle and a gate's
 * refusal are `power-up-core`'s lines. The envelope already carries planet, depth and tick.
 */
import type { SliceEventProjections } from '../../logging/registries/eventProjections'
import type { SliceRunEvents } from '../../logging/registries/runEvents'
import './systems/drillGearEvents'

export const DRILL_GEAR_PROJECTIONS: SliceEventProjections = {
  'drill-gear.GroundCrumbled': ({ tx, ty }) => ({
    event: 'drill-gear.ground_crumbled',
    data: { tx, ty },
  }),
  'drill-gear.TunnelBackfilled': ({ tx, ty }) => ({
    event: 'drill-gear.tunnel_backfilled',
    data: { tx, ty },
  }),
  'drill-gear.OreSampled': ({ tx, ty, oreId }) => ({
    event: 'drill-gear.ore_sampled',
    data: { tx, ty, oreId },
  }),
}

const TILE = { tx: 'integer', ty: 'integer' } as const

export const DRILL_GEAR_RUN_EVENTS: SliceRunEvents = {
  'drill-gear.ground_crumbled': { group: 'mining', level: 'core', payload: TILE },
  'drill-gear.tunnel_backfilled': { group: 'mining', level: 'core', payload: TILE },
  'drill-gear.ore_sampled': {
    group: 'mining',
    level: 'core',
    payload: { ...TILE, oreId: 'text' },
  },
}
