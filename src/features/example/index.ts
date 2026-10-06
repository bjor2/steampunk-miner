/**
 * The example slice's public API: the only file another slice may import from this folder
 * (docs/standards/feature-slices.md 2.1). Types, pure read selectors and constants; never React,
 * zustand or a store object.
 */
export const EXAMPLE_SLICE_ID = 'example'
export type { ExampleReport } from './systems/describeExample'
export { describeExample } from './systems/describeExample'
