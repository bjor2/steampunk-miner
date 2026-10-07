/**
 * The ground-gun slice's registration (ticket 322, the numbers half of #309 build 2 and #310
 * builds 2 and 3): nothing yet. The bore gun's data, track rules and module ladders live here for
 * the kernel's bore command (#313), the slice build (#314) and the armoury lanes (#318, #319) to
 * read; registering the tracks, cards, fire tile and provider is #314's. No side effects at
 * import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'

export const slice: SliceDefinition = {
  id: 'ground-gun',
  register() {},
}
