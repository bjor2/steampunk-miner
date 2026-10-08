/**
 * Every item that can run on auto (ticket 317): the kernel's own (the bore gun's steam sear),
 * then the slices' (`autoActors`), each found by its item id. An item no actor answers for is
 * held `unavailable`.
 */
import { AUTO_ACTOR_REGISTRY, type AutoActor } from '../../registries/autoActors'
import { entriesOf } from '../../registries/seal'
import { BORE_AUTO_ACTOR } from '../bore/boreAuto'

const KERNEL_AUTO_ACTORS: readonly AutoActor[] = [BORE_AUTO_ACTOR]

export function autoActorOf(itemId: string): AutoActor | null {
  const isForItem = (actor: AutoActor) => actor.itemId === itemId
  return (
    KERNEL_AUTO_ACTORS.find(isForItem) ?? entriesOf(AUTO_ACTOR_REGISTRY).find(isForItem) ?? null
  )
}
