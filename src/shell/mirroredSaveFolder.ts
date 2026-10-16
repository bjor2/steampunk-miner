/**
 * A browser's save folder kept twice (#470 P1-8, ticket 479): every slot is written to the primary
 * store (localStorage, about 5 MB an origin) and mirrored to IndexedDB (far larger), so one store
 * filling up or being cleared loses no save. A read takes whichever copy carries the newer
 * `saveEpoch` (`newerSaveText.ts`); a write fails only when neither store took it, which the
 * checkpoint shows the player as "progress not saved". A delete and a refused save's set-aside go
 * to both, so a removed or refused save never comes back from the mirror.
 */
import { newerSaveTextOf } from '../systems/save/newerSaveText'
import type { StoredSaveSlot } from '../../electron/bridgeContract.cts'
import type { StoredSaveFolder } from './storedSaveSlots'

/** The shell's save folder as the shell hands it out: every call settles later. */
export interface ShellSaveFolder {
  write(slot: string, json: string, entryJson: string): Promise<void>
  read(slot: string): Promise<string | null>
  list(): Promise<StoredSaveSlot[]>
  remove(slot: string): Promise<void>
  setAside(slot: string): Promise<void>
}

/** A synchronous store's calls, each settling as soon as it ran (a throw rejects). */
export function settlingFolderOf(stored: StoredSaveFolder): ShellSaveFolder {
  return {
    write: async (slot, json, entryJson) => stored.write(slot, json, entryJson),
    read: async (slot) => stored.read(slot),
    list: async () => stored.list(),
    remove: async (slot) => stored.remove(slot),
    setAside: async (slot) => stored.setAside(slot),
  }
}

/**
 * The primary is called first on every write, before anything is awaited, so a write queued as
 * the page hides reaches localStorage in the same task.
 */
export function mirrorSaveFolder(
  primary: ShellSaveFolder,
  mirror: ShellSaveFolder,
): ShellSaveFolder {
  return {
    write: async (slot, json, entryJson) =>
      throwUnlessOneLanded(
        await bothSettled(
          primary.write(slot, json, entryJson),
          mirror.write(slot, json, entryJson),
        ),
      ),
    read: async (slot) => readNewerCopy(primary, mirror, slot),
    list: async () => listBothStores(primary, mirror),
    remove: async (slot) =>
      throwIfAnyFailed(await bothSettled(primary.remove(slot), mirror.remove(slot))),
    setAside: async (slot) =>
      throwIfAnyFailed(await bothSettled(primary.setAside(slot), mirror.setAside(slot))),
  }
}

type BothSettled<T> = [PromiseSettledResult<T>, PromiseSettledResult<T>]

function bothSettled<T>(first: Promise<T>, second: Promise<T>): Promise<BothSettled<T>> {
  return Promise.allSettled([first, second]) as Promise<BothSettled<T>>
}

/** The primary's error is the one reported: it says why the store the player relies on failed. */
function throwUnlessOneLanded(results: BothSettled<void>): void {
  const failures = failuresOf(results)
  if (failures.length === results.length) throw failures[0]
  if (failures.length > 0) console.warn('save written to one store only', failures[0])
}

function throwIfAnyFailed(results: BothSettled<void>): void {
  const failures = failuresOf(results)
  if (failures.length > 0) throw failures[0]
}

function failuresOf<T>(results: BothSettled<T>): unknown[] {
  return results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []))
}

/** A store that cannot be read (IndexedDB refused in a private window) counts as holding nothing. */
function valuesOrThrow<T>(results: BothSettled<T>, empty: T): [T, T] {
  const failures = failuresOf(results)
  if (failures.length === results.length) throw failures[0]
  return results.map((result) => (result.status === 'fulfilled' ? result.value : empty)) as [T, T]
}

async function readNewerCopy(
  primary: ShellSaveFolder,
  mirror: ShellSaveFolder,
  slot: string,
): Promise<string | null> {
  const [first, second] = valuesOrThrow(
    await bothSettled(primary.read(slot), mirror.read(slot)),
    null,
  )
  return newerSaveTextOf(first, second)
}

/** Every slot either store holds; where their entries differ, the newer copy's entry. */
async function listBothStores(
  primary: ShellSaveFolder,
  mirror: ShellSaveFolder,
): Promise<StoredSaveSlot[]> {
  const listed = valuesOrThrow(await bothSettled(primary.list(), mirror.list()), [])
  const slots = [...new Set(listed.flat().map((stored) => stored.slot))].sort()
  const copiesOf = (slot: string) => listed.map((stored) => storedIn(stored, slot))
  return Promise.all(slots.map((slot) => newerStoredSlot(primary, mirror, copiesOf(slot))))
}

function storedIn(stored: readonly StoredSaveSlot[], slot: string): StoredSaveSlot | undefined {
  return stored.find((candidate) => candidate.slot === slot)
}

/** Both stores' entries agree after every write that reached both, so the texts are rarely read. */
async function newerStoredSlot(
  primary: ShellSaveFolder,
  mirror: ShellSaveFolder,
  [first, second]: (StoredSaveSlot | undefined)[],
): Promise<StoredSaveSlot> {
  if (first === undefined || second === undefined) return (first ?? second) as StoredSaveSlot
  if (first.entry === second.entry) return first
  const newer = await readNewerCopy(primary, mirror, first.slot)
  return newer === (await primary.read(first.slot)) ? first : second
}
