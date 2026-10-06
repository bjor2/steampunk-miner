/**
 * The page's live event listeners (#121, `memory_sample.listeners`): no browser API counts them
 * outside DevTools, so test runs wrap `addEventListener` and `removeEventListener` before the scene
 * mounts, as the Rapier WASM watch does (#119). A registration is one (target, type, capture,
 * listener), which the DOM keeps once however often it is added. `once` listeners are left out,
 * because they drop themselves where no wrapper sees it; a `signal` abort removes like
 * `removeEventListener`; a target that is garbage collected takes its listeners out of the count.
 */

export interface ListenerCount {
  live(): number
}

type Listener = EventListenerOrEventListenerObject
type AddListener = EventTarget['addEventListener']
type RemoveListener = EventTarget['removeEventListener']

/** A target's registrations: `type` and capture as one key, then the listeners under it. */
interface TargetListeners {
  byTypeAndCapture: Map<string, Set<Listener>>
  tally: { count: number }
}

/** Every counted registration, per target, and their total. */
interface ListenerBook {
  total: { count: number }
  listenersOf: WeakMap<EventTarget, TargetListeners>
  collected: FinalizationRegistry<{ count: number }>
}

let pageListeners: ListenerCount | null = null

/** Starts counting every listener of the page; once per page, before the scene mounts. */
export function watchPageListeners(): void {
  pageListeners ??= countListenersOn(EventTarget.prototype)
}

/** 0 until `watchPageListeners` ran. */
export function pageListenerCount(): number {
  return pageListeners?.live() ?? 0
}

/** Wraps `prototype`'s add and remove; every target that inherits them is counted from then on. */
export function countListenersOn(prototype: EventTarget): ListenerCount {
  const book = createListenerBook()
  const add = prototype.addEventListener
  prototype.addEventListener = addCountedWith(book, add)
  prototype.removeEventListener = removeCountedWith(book, prototype.removeEventListener)
  return { live: () => book.total.count }
}

function createListenerBook(): ListenerBook {
  const total = { count: 0 }
  return {
    total,
    listenersOf: new WeakMap(),
    collected: new FinalizationRegistry((tally) => {
      total.count -= tally.count
    }),
  }
}

/** A bare `addEventListener(...)` in a module has no `this`; the DOM reads that as the window. */
function addCountedWith(book: ListenerBook, add: AddListener): AddListener {
  return function addCounted(this: EventTarget | undefined, type, listener, options) {
    const target = this ?? globalThis
    add.call(target, type, listener, options)
    if (isCountedRegistration(listener, options)) {
      const key = keyOf(type, options)
      rememberListener(book, target, key, listener)
      forgetOnAbort(add, signalOf(options), () => forgetListener(book, target, key, listener))
    }
  }
}

function removeCountedWith(book: ListenerBook, remove: RemoveListener): RemoveListener {
  return function removeCounted(this: EventTarget | undefined, type, listener, options) {
    const target = this ?? globalThis
    remove.call(target, type, listener, options)
    if (listener !== null) forgetListener(book, target, keyOf(type, options), listener)
  }
}

function rememberListener(
  book: ListenerBook,
  target: EventTarget,
  key: string,
  listener: Listener,
): void {
  const registered = book.listenersOf.get(target) ?? startTarget(book, target)
  const listeners = listenersUnder(registered, key)
  if (listeners.has(listener)) return
  listeners.add(listener)
  registered.tally.count++
  book.total.count++
}

function forgetListener(
  book: ListenerBook,
  target: EventTarget,
  key: string,
  listener: Listener,
): void {
  const registered = book.listenersOf.get(target)
  if (registered?.byTypeAndCapture.get(key)?.delete(listener) !== true) return
  registered.tally.count--
  book.total.count--
}

function startTarget(book: ListenerBook, target: EventTarget): TargetListeners {
  const registered = { byTypeAndCapture: new Map(), tally: { count: 0 } }
  book.listenersOf.set(target, registered)
  // The tally holds no listener, so the registry keeps nothing of the target alive.
  book.collected.register(target, registered.tally)
  return registered
}

function listenersUnder(registered: TargetListeners, key: string): Set<Listener> {
  const listeners = registered.byTypeAndCapture.get(key) ?? new Set()
  registered.byTypeAndCapture.set(key, listeners)
  return listeners
}

/** A null listener adds nothing; a `once` one or one with an aborted signal is not kept. */
function isCountedRegistration(
  listener: Listener | null,
  options: boolean | AddEventListenerOptions | undefined,
): listener is Listener {
  if (listener === null || typeof options !== 'object') return listener !== null
  return options.once !== true && options.signal?.aborted !== true
}

/** The DOM tells registrations apart by type, listener and capture only. */
function keyOf(type: string, options: boolean | EventListenerOptions | undefined): string {
  const capture = typeof options === 'boolean' ? options : options?.capture === true
  return `${type}|${capture}`
}

function signalOf(options: boolean | AddEventListenerOptions | undefined): AbortSignal | undefined {
  return typeof options === 'object' ? options.signal : undefined
}

/** Through the unwrapped `add`, so the abort listener is not itself counted. */
function forgetOnAbort(add: AddListener, signal: AbortSignal | undefined, forget: () => void) {
  if (signal !== undefined) add.call(signal, 'abort', forget, { once: true })
}
