/**
 * An item slice's specs with `power-up-core` registered beside its own slice and fixtures (ticket
 * 328): the press path's section, its use clock and its commands run only while this slice is
 * registered, and another slice never imports its `register.ts`. Spec-only, like `fakeItems.ts`:
 * no `register.ts` calls it.
 */
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { slice } from './register'

export function withPowerUpCore<T>(slices: readonly SliceDefinition[], run: () => T): T {
  return withRegistrations([slice, ...slices], run)
}
