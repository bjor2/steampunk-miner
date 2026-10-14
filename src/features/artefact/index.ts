/**
 * The artefact slice's public API (feature-slices.md 2.1): the only file another slice may import
 * from this folder. The artefact twists (#162, ticket 329): a fourth cache card per owned base
 * item, played by that item's lane through the kernel `twist` hook.
 */
export const ARTEFACT_SLICE_ID = 'artefact'
export type { Twist } from './systems/twistCatalogue'
export { TWISTS, twistOf } from './systems/twistCatalogue'
