/** `GroundChanged` per chunk an edit touched, at the chunk's new version (#36). */
import type { GroundEdit } from '../world/groundEdit'
import { deltaOfChunk } from '../world/worldState'
import type { DomainEventBody } from './domainEvent'

export function groundChangedEventsOf(
  edit: Pick<GroundEdit, 'world' | 'changes'>,
): DomainEventBody[] {
  return edit.changes.map((change) => ({
    type: 'GroundChanged',
    ...change,
    version: deltaOfChunk(edit.world, change.cx, change.cy).version,
  }))
}
