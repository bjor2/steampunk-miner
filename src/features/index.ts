/**
 * The slice loader (docs/standards/feature-slices.md 3.3), kernel-owned: finds every
 * `src/features/<slice>/register.ts`, registers the slices in id order and seals the registries.
 * Only the composition roots call it (`bootstrap.ts`, `testSetup.ts`, `scripts/*.ts`), first,
 * before any tick, render or test; a slice never imports it (lint).
 */
import { loadSlices } from '../registries/registrar'
import type { SliceDefinition } from '../registries/sliceDefinition'
import { slicesOfModules } from '../registries/sliceModules'

// A glob, not an import list: adding a slice never edits this file.
const SLICE_MODULES = import.meta.glob<{ slice: SliceDefinition }>('./*/register.ts', {
  eager: true,
})

let loadedSliceIds: readonly string[] | null = null

/** The loaded slice ids in registration order; a second call returns the same list. */
export function loadFeatures(): readonly string[] {
  loadedSliceIds ??= loadSlices(slicesOfModules(SLICE_MODULES))
  return loadedSliceIds
}
