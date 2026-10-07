/**
 * The dynamite-visuals slice's registration: no side effects at import; the loader calls
 * `register`. Nothing is registered yet (#145): the art ids, the scene layer and the
 * `chargeBlastCue` provider land with the wiring (#215) once their kernel registries exist
 * (#213, #214). Until then the slice is its pure look rules and the committed Blender sources.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'

export const slice: SliceDefinition = {
  id: 'dynamite-visuals',
  register() {},
}
