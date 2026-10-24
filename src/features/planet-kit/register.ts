/**
 * The planet-kit slice's registration: no side effects at import; the loader calls `register`.
 * Ticket 820 ships the data rows only ("rows only, no code"), so nothing registers yet and every
 * golden, balance output and stats.json stays byte-identical. PK2 (#821) registers the merchant
 * variants, PK4 (#823) the items with their stats.json rows (`cache_crate`, `scree_plough`,
 * `damp_flask`, `shard_tongs`, `vent_vane`) and the merchants re-pin.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'

export const slice: SliceDefinition = {
  id: 'planet-kit',
  register() {},
}
