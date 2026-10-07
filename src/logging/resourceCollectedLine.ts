/**
 * The `resource_collected` line of a `CargoAdded` (#122): the cell's depth is `oreDepthTiles`,
 * because the envelope's `depthTiles` is where the vehicle is. A slice catalogue's `family` and
 * `signature` (#223) are copied only when the unit names them, so a kernel-default line is the
 * line it always was and the optional fields keep `LOG_SCHEMA_VERSION`.
 */
import type { DomainEventBodies } from '../systems/authority/domainEvent'
import type { RunEventData } from './eventNames'

export function resourceCollectedDataOf(
  added: DomainEventBodies['CargoAdded'],
): RunEventData<'resource_collected'> {
  const { resourceTier, amount, value, oreId, depthTiles, chunk } = added
  return {
    resourceTier,
    amount,
    value,
    oreId,
    ...catalogueTagsOf(added),
    oreDepthTiles: depthTiles,
    chunk,
  }
}

function catalogueTagsOf({ family, signature }: DomainEventBodies['CargoAdded']) {
  return {
    ...(family === undefined ? {} : { family }),
    ...(signature === undefined ? {} : { signature }),
  }
}
