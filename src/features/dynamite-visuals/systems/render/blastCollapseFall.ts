/**
 * The rumble-and-fall of a blast's collapse (D8, ticket 868: "collapse has its own rumble-and-fall
 * effect after the ≥1 s blink, never reads as a second blast"): the kernel telegraphs every
 * collapsing block with cracks and dust and blinks a lined one (#43, ticket 830); a block a bare
 * blast rolled (`BlastCollapseRolled {isCollapsing}`, D2 #861) is watched from its roll, and when
 * its refill starts (`CollapseStarted`) it falls: dull dust and a few chips sinking toward the
 * planet's centre from the block's face, no fire, no flash, no ring. Pure records; a cancelled
 * block is forgotten.
 */
import type { DomainEvent } from '../../../../systems/authority/domainEvent'
import { blockOfId, firstSampleOfBlock } from '../../../../systems/world/collapseBlock'
import { SAMPLES_PER_TILE } from '../../../../systems/world/sampleGrid'
import { BLOCK_SIZE_M } from '../../../../systems/render/collapseTelegraph'

/** One falling block: its lower-left corner and side in metres. */
export interface CollapseFall {
  x0: number
  y0: number
  sizeM: number
}

export interface CollapseFallWatch {
  /** Block ids a blast rolled to collapse, waiting for their refill. */
  watched: readonly string[]
  /** The falls this batch started. */
  falls: readonly CollapseFall[]
}

export const EMPTY_FALL_WATCH: CollapseFallWatch = { watched: [], falls: [] }

/** The watch after a batch of events: new rolls watched, refills of watched blocks fallen. */
export function collapseFallsAfter(
  watch: CollapseFallWatch,
  events: readonly DomainEvent[],
): CollapseFallWatch {
  return events.reduce<CollapseFallWatch>(watchAfterEvent, { watched: watch.watched, falls: [] })
}

function watchAfterEvent(watch: CollapseFallWatch, event: DomainEvent): CollapseFallWatch {
  if (event.type === 'BlastCollapseRolled' && event.isCollapsing)
    return withWatched(watch, event.block)
  if (event.type === 'CollapseCancelled') return withoutBlock(watch, event.block)
  if (event.type === 'CollapseStarted' && watch.watched.includes(event.block)) {
    return withFall(withoutBlock(watch, event.block), event.block)
  }
  if (event.type === 'PlanetEntered') return { watched: [], falls: watch.falls }
  return watch
}

function withWatched(watch: CollapseFallWatch, block: string): CollapseFallWatch {
  if (watch.watched.includes(block)) return watch
  return { ...watch, watched: [...watch.watched, block] }
}

function withoutBlock(watch: CollapseFallWatch, block: string): CollapseFallWatch {
  return { ...watch, watched: watch.watched.filter((watched) => watched !== block) }
}

function withFall(watch: CollapseFallWatch, blockId: string): CollapseFallWatch {
  const fall = fallOfBlock(blockId)
  return fall === null ? watch : { ...watch, falls: [...watch.falls, fall] }
}

/** Where a block id's face lies, metres; null for an id that names no block. */
export function fallOfBlock(blockId: string): CollapseFall | null {
  const block = blockOfId(blockId)
  if (block === null) return null
  const first = firstSampleOfBlock(block)
  return { x0: first.sx / SAMPLES_PER_TILE, y0: first.sy / SAMPLES_PER_TILE, sizeM: BLOCK_SIZE_M }
}
