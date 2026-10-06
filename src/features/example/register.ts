/** The example slice's registration: no side effects at import; the loader calls `register`. */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { exampleDebugActions } from './debug'

export const slice: SliceDefinition = {
  id: 'example',
  register(r) {
    // steampunkDebug.features.example.describe()
    r.debugActions(exampleDebugActions)
    // A real slice adds e.g. r.content('vehicle-item', [...]),
    // r.gateCheck({ id: 'example.x', check }) or r.saveSection({ id: 'example', version: 1, ... }).
  },
}
