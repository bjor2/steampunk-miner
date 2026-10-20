/**
 * The mineral skins slice (ticket 591 under #576): the skin table and its generator, pure data and
 * rules with nothing to register yet. The batch tickets (#592 to #606) bring the layers' art,
 * which joins here through `r.artAssets`. No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'

export const slice: SliceDefinition = {
  id: 'mineral-skins',
  register() {
    // Look data only so far: no command, event, log line, save section or generation hook.
  },
}
