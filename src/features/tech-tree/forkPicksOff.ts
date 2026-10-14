/**
 * The pacing bot with its fork pick switched off, all else equal (ticket 392): the loaded
 * registrations without this slice's `tech-tree.choose-fork` bot purchase, so the bot never
 * chooses a branch on its own while every slice, the tree and the forks stay exactly as loaded. A
 * pace spec compares a run that chose Deep against this unchosen one. Only specs use it.
 */
import { BOT_PURCHASE_REGISTRY } from '../../systems/registries/botPurchases'
import { createRegistrySet, swapRegistrySet, type RegistrySet } from '../../systems/registries/seal'
import { FORK_CHOICE_BOT_PURCHASE } from './systems/forkBotPurchases'

type Shelf = RegistrySet['shelves'] extends Map<unknown, infer S> ? S : never

/** Runs `run` on the loaded registrations minus the fork pick, then puts the loaded set back. */
export function withoutPacingBotForkPicks<T>(run: () => T): T {
  const loaded = swapRegistrySet(createRegistrySet())
  try {
    swapRegistrySet(registrySetWithoutForkPicks(loaded))
    return run()
  } finally {
    swapRegistrySet(loaded)
  }
}

/** A sealed copy of `loaded`'s shelves with the bot purchases' shelf missing the fork pick. */
function registrySetWithoutForkPicks(loaded: RegistrySet): RegistrySet {
  const shelves = new Map(loaded.shelves)
  const purchases = shelves.get(BOT_PURCHASE_REGISTRY)
  if (purchases !== undefined) shelves.set(BOT_PURCHASE_REGISTRY, shelfWithoutForkPick(purchases))
  return { isSealed: loaded.isSealed, shelves }
}

function shelfWithoutForkPick(shelf: Shelf): Shelf {
  const isKept = (entry: { id: string }) => entry.id !== FORK_CHOICE_BOT_PURCHASE.id
  return {
    registrations: shelf.registrations.filter((registration) => isKept(registration.entry)),
    sorted: shelf.sorted.filter(isKept),
  }
}
