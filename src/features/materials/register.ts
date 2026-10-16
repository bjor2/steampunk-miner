/**
 * The materials slice's registration: no side effects at import; the loader calls `register`.
 * Ticket 444 ships the data layer only (the table, its loader and guards), so nothing registers
 * yet: the roster generation hook and the shader look arrive with the tickets that use the rows,
 * and no worldgen, render, save or price changes until then.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'

export const slice: SliceDefinition = {
  id: 'materials',
  register() {},
}
