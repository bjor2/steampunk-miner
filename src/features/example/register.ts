/** The example slice's registration: no side effects at import; the loader calls `register`. */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { exampleDebugActions } from './debug'
import { EXAMPLE_VEHICLE_PIECE_ID, ExampleVehiclePiece } from './scene/ExampleVehiclePiece'
import { EXAMPLE_SCREEN_ID, ExampleScreen } from './ui/ExampleScreen'
import { UI_PARTS_SCREEN_ID, UiPartsScreen } from './ui/UiPartsScreen'

export const slice: SliceDefinition = {
  id: 'example',
  register(r) {
    // steampunkDebug.features.example.describe()
    r.debugActions(exampleDebugActions)
    // steampunkDebug.ui.openScreen('example.screen'); the kernel shell draws it over the game.
    r.screen({ id: EXAMPLE_SCREEN_ID, priority: 0, render: ExampleScreen })
    // steampunkDebug.ui.openScreen('example.ui-parts'): the shared UI parts on one page (#423).
    r.screen({ id: UI_PARTS_SCREEN_ID, priority: 0, render: UiPartsScreen })
    // steampunkDebug.features.example.mountTestPiece(); the kernel's vehicle draws it on the car.
    r.vehiclePiece({ id: EXAMPLE_VEHICLE_PIECE_ID, Piece: ExampleVehiclePiece })
    // A real slice adds e.g. r.content('vehicle-item', [...]),
    // r.gateCheck({ id: 'example.x', check }) or r.saveSection({ id: 'example', version: 1, ... }).
  },
}
