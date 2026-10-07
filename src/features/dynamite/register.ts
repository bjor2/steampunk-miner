/**
 * The dynamite slice (#149, spec #143; GD and TD locks on #149): the product surface of the size
 * ladder the kernel owns. The charges machine (plant, fuse, live blast, rack, disarm) stays
 * kernel. No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { dynamiteSizes } from './systems/dynamiteSizes'

export const slice: SliceDefinition = {
  id: 'dynamite',
  register(r) {
    r.content('dynamite-size', dynamiteSizes())
  },
}
