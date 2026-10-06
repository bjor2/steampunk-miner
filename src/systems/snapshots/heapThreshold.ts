/**
 * When a debug run takes a heap snapshot (#123, logging strategy section 1: "when heap crosses a
 * threshold, e.g. +50 MB since start"). The first `memory_sample` reading is the start; each later
 * reading that has climbed a further whole step above it is due a snapshot. A step is taken once:
 * a heap that falls back under a boundary after a GC and climbs again does not take it twice, so
 * a heap hovering at a boundary gives one snapshot, not one per sample. Mutated in place.
 */

export interface HeapWatch {
  readonly stepKB: number
  startKB: number | null
  stepsTaken: number
}

export function createHeapWatch(stepKB: number): HeapWatch {
  return { stepKB, startKB: null, stepsTaken: 0 }
}

/** The step the heap has newly reached above the start (1 = one step), or 0 when none is due. */
export function takeHeapStepReached(watch: HeapWatch, usedKB: number): number {
  if (watch.startKB === null) {
    watch.startKB = usedKB
    return 0
  }
  const reached = stepsAboveStart(watch, watch.startKB, usedKB)
  if (reached <= watch.stepsTaken) return 0
  watch.stepsTaken = reached
  return reached
}

function stepsAboveStart(watch: HeapWatch, startKB: number, usedKB: number): number {
  return Math.floor((usedKB - startKB) / watch.stepKB)
}
