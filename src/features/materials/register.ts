/**
 * The materials slice's registration: no side effects at import; the loader calls `register`.
 * Ticket 444 shipped the data layer only (the table, its loader and guards); the roster draws the
 * rows into the ground and hands the shader their looks. The per-act hero atlases' art moved to the
 * mineral skins slice with their pages (ticket 852), since a hero's page lives on its skin row.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'

export const slice: SliceDefinition = {
  id: 'materials',
  register() {
    // Data only: no command, event, log line, save section or art.
  },
}
