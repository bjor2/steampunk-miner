/**
 * The planet registry's hazard kinds as the kernel's contact-effect rows (ticket 848, the HS's one
 * generic registry where a new hazard is a data row): one row per kind of `planets.hazards`
 * (`hazardKinds.ts`), id `ores.<kind>`, its numbers as the table holds them. A new hazard is a new
 * kind in the table and plays with no code here.
 */
import type { ContactEffectRow } from '../../../systems/registries/contactEffects'
import type { HazardKinds } from './hazardKinds'

export function hazardContactRowsOf(kinds: HazardKinds): ContactEffectRow[] {
  return Object.entries(kinds).map(([kind, numbers]) => ({ id: `ores.${kind}`, kind, ...numbers }))
}
