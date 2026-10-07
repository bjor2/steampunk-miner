/** The example slice's registration: no side effects at import; the loader calls `register`. */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { exampleDebugActions } from './debug'
import { EXAMPLE_SCREEN_ID, ExampleScreen } from './ui/ExampleScreen'

export const slice: SliceDefinition = {
  id: 'example',
  register(r) {
    // steampunkDebug.features.example.describe()
    r.debugActions(exampleDebugActions)
    // steampunkDebug.ui.openScreen('example.screen'); the kernel shell draws it over the game.
    r.screen({ id: EXAMPLE_SCREEN_ID, priority: 0, render: ExampleScreen })
    // A real slice adds e.g. r.content('vehicle-item', [...]),
    // r.gateCheck({ id: 'example.x', check }) or r.saveSection({ id: 'example', version: 1, ... }).
  },
}
