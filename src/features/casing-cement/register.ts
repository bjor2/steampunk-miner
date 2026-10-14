/**
 * The casing-cement slice (ticket 367, piece ii-b of the #157 ground-strengthening seam): casing
 * lining laid in a cement grade (refractory P8, insulated P17, grounded P25; ticket 366) cases the
 * ground round it, so a collapse never warns or refills it. One `groundReinforcement` provider read
 * from the kernel's casing layer; no section, command or event of its own.
 * No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { CEMENT_REINFORCEMENT } from './systems/cementReinforcement'

export const slice: SliceDefinition = {
  id: 'casing-cement',
  register(r) {
    r.reinforcement(CEMENT_REINFORCEMENT)
  },
}
