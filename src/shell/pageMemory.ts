/**
 * What the page holds (#121, `memory_sample`): Chromium's JS heap from `performance.memory`, which
 * Electron's renderer has and other browsers lack, the document's elements, and the live event
 * listeners once a test run started counting them. Read only when asked; nothing forces a GC.
 * Chromium rounds and caches the heap unless launched with `--enable-precise-memory-info`: a
 * `?debug` session without the flag read one value for 40 s (#121), so heap trends need the flag.
 */
import { pageListenerCount } from './listenerCount'

/** Bytes, as `performance.memory` reports them. */
export interface JsHeap {
  usedBytes: number
  totalBytes: number
  limitBytes: number
}

export interface PageMemory {
  /** Null outside Chromium. */
  jsHeap: JsHeap | null
  /** Elements in the document now. */
  domNodes: number
  listeners: number
}

/** Chromium's non-standard `performance.memory`. */
interface ChromiumHeap {
  usedJSHeapSize: number
  totalJSHeapSize: number
  jsHeapSizeLimit: number
}

export function readPageMemory(): PageMemory {
  return {
    jsHeap: jsHeapNow(),
    domNodes: document.getElementsByTagName('*').length,
    listeners: pageListenerCount(),
  }
}

function jsHeapNow(): JsHeap | null {
  const heap = (performance as Performance & { memory?: ChromiumHeap }).memory
  if (heap === undefined) return null
  return {
    usedBytes: heap.usedJSHeapSize,
    totalBytes: heap.totalJSHeapSize,
    limitBytes: heap.jsHeapSizeLimit,
  }
}
