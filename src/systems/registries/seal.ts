/**
 * The core every kernel registry shares (docs/standards/feature-slices.md 3.1): append-only, ids
 * unique, read sorted by id, sealed by `loadFeatures()`. Reading before the seal throws
 * `FeaturesNotLoadedError`, so a composition root that forgets the loader fails at its first read
 * instead of silently running with no slices.
 *
 * Every registration lives in one swappable set, so a kernel spec can register fakes in a fresh set
 * and put the loaded one back (`withRegistrations` in src/registries/registrar.ts).
 */

export interface RegistryEntry {
  readonly id: string
}

export interface Registry<T extends RegistryEntry> {
  readonly name: string
  /** `oreTypes`, `oreLook` and `discovery` take one provider; the seal refuses a second. */
  readonly providerLimit: number | null
  /** Never set: it carries the entry type, so a read returns what was registered. */
  readonly entryType?: T
}

interface Registration {
  readonly sliceId: string
  readonly entry: RegistryEntry
}

interface Shelf {
  readonly registrations: Registration[]
  sorted: readonly RegistryEntry[]
}

export interface RegistrySet {
  isSealed: boolean
  readonly shelves: Map<Registry<RegistryEntry>, Shelf>
}

/** A registry read before `loadFeatures()` sealed the registries. */
export class FeaturesNotLoadedError extends Error {
  constructor(registryName: string) {
    super(
      `registry "${registryName}" read before loadFeatures(): call it first in the composition root`,
    )
    this.name = 'FeaturesNotLoadedError'
  }
}

/** A registration the registries refuse: after the seal, a duplicate id or a second provider. */
export class RegistrationRefusedError extends Error {
  constructor(problem: string) {
    super(problem)
    this.name = 'RegistrationRefusedError'
  }
}

const NO_ENTRIES: readonly never[] = Object.freeze([])

let current: RegistrySet = createRegistrySet()

export function createRegistrySet(): RegistrySet {
  return { isSealed: false, shelves: new Map() }
}

/** Installs `next` and returns the set it replaced: the test seam's only door. */
export function swapRegistrySet(next: RegistrySet): RegistrySet {
  const previous = current
  current = next
  return previous
}

/**
 * Runs `run` on a fresh set that `fill` registered into and the seal closed, then puts the set it
 * replaced back, even when `run` throws. Synchronous only: a promise outlives the swap.
 */
export function withFreshRegistrySet<T>(fill: () => void, run: () => T): T {
  const previous = swapRegistrySet(createRegistrySet())
  try {
    fill()
    sealRegistrySet()
    return run()
  } finally {
    swapRegistrySet(previous)
  }
}

export function defineRegistry<T extends RegistryEntry>(name: string): Registry<T> {
  return { name, providerLimit: null }
}

export function defineOneProviderRegistry<T extends RegistryEntry>(name: string): Registry<T> {
  return { name, providerLimit: 1 }
}

export function addToRegistry<T extends RegistryEntry>(
  registry: Registry<T>,
  sliceId: string,
  entry: T,
): void {
  refuseWhenSealed(registry, sliceId, entry)
  refuseDuplicateId(registry, sliceId, entry)
  shelfOf(registry).registrations.push({ sliceId, entry })
}

/** The registry's entries sorted by id; throws `FeaturesNotLoadedError` before the seal. */
export function entriesOf<T extends RegistryEntry>(registry: Registry<T>): readonly T[] {
  if (!current.isSealed) throw new FeaturesNotLoadedError(registry.name)
  return (current.shelves.get(registry)?.sorted ?? NO_ENTRIES) as readonly T[]
}

/** Checks every provider limit, then freezes each registry sorted by id. */
export function sealRegistrySet(): void {
  current.shelves.forEach(refuseProvidersOverLimit)
  current.shelves.forEach(sortShelf)
  current.isSealed = true
}

export function areRegistriesSealed(): boolean {
  return current.isSealed
}

function shelfOf(registry: Registry<RegistryEntry>): Shelf {
  const existing = current.shelves.get(registry)
  if (existing !== undefined) return existing
  const shelf: Shelf = { registrations: [], sorted: NO_ENTRIES }
  current.shelves.set(registry, shelf)
  return shelf
}

function refuseWhenSealed(
  registry: Registry<RegistryEntry>,
  sliceId: string,
  entry: RegistryEntry,
) {
  if (!current.isSealed) return
  throw new RegistrationRefusedError(
    `slice "${sliceId}" registered "${entry.id}" in "${registry.name}" after the registries were sealed`,
  )
}

function refuseDuplicateId(
  registry: Registry<RegistryEntry>,
  sliceId: string,
  entry: RegistryEntry,
) {
  const taken = current.shelves
    .get(registry)
    ?.registrations.find((registration) => registration.entry.id === entry.id)
  if (taken === undefined) return
  throw new RegistrationRefusedError(
    `"${entry.id}" is registered twice in "${registry.name}": by slice "${taken.sliceId}" and by slice "${sliceId}"`,
  )
}

function refuseProvidersOverLimit(shelf: Shelf, registry: Registry<RegistryEntry>): void {
  if (!isOverProviderLimit(shelf, registry)) return
  const slices = shelf.registrations.map((registration) => `"${registration.sliceId}"`)
  throw new RegistrationRefusedError(
    `"${registry.name}" takes one provider, but slices ${slices.join(' and ')} each registered one`,
  )
}

function isOverProviderLimit(shelf: Shelf, registry: Registry<RegistryEntry>): boolean {
  const limit = registry.providerLimit
  return limit !== null && shelf.registrations.length > limit
}

function sortShelf(shelf: Shelf): void {
  const entries = shelf.registrations.map((registration) => registration.entry)
  shelf.sorted = Object.freeze(entries.sort(compareIds))
}

/** Code-unit order, never locale order, so every machine iterates the same way. */
function compareIds(a: RegistryEntry, b: RegistryEntry): number {
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}
