/** The example slice's registration: no side effects at import; the loader calls `register`. */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { exampleDebugActions } from './debug'
import { EXAMPLE_VEHICLE_PIECE_ID, ExampleVehiclePiece } from './scene/ExampleVehiclePiece'
import { EXAMPLE_SCREEN_ID, ExampleScreen } from './ui/ExampleScreen'

export const slice: SliceDefinition = {
  id: 'example',
  register(r) {
    // steampunkDebug.features.example.describe()
    r.debugActions(exampleDebugActions)
    // steampunkDebug.ui.openScreen('example.screen'); the kernel shell draws it over the game.
    r.screen({ id: EXAMPLE_SCREEN_ID, priority: 0, render: ExampleScreen })
    // steampunkDebug.features.example.mountTestPiece(); the kernel's vehicle draws it on the car.
    r.vehiclePiece({ id: EXAMPLE_VEHICLE_PIECE_ID, Piece: ExampleVehiclePiece })
    // A real slice adds e.g. r.content('vehicle-item', [...]),
    // r.gateCheck({ id: 'example.x', check }) or r.saveSection({ id: 'example', version: 1, ... }).
  },
}
