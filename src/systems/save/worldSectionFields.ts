/**
 * The world section's optional fields (ticket 445 split them from `saveSlot.ts`): each key is
 * written only while it holds something, as the snapshot has it, so a save that never had one reads
 * and digests as before.
 */
import type { PortableState } from '../authority/sessionSnapshot'
import { withOreRulesVersion, type SessionPlanet } from '../authority/planetOfState'

/** Where the world section says which planet it is on. */
export interface WorldSectionPlanet {
  worldSeed: number
  planetIndex: number
  /** The ore rules the planet was entered under (ticket 445); omitted on the legacy rows. */
  oreRulesVersion?: number
}

/** The planet's ore rules under their key, or no key on the legacy rows. */
export function oreRulesFieldOf(
  planet: SessionPlanet,
): Pick<WorldSectionPlanet, 'oreRulesVersion'> {
  const { oreRulesVersion } = planet
  return oreRulesVersion === undefined ? {} : { oreRulesVersion }
}

/** The planet the world section is on, its ore rules included. */
export function planetOfWorld(world: WorldSectionPlanet): SessionPlanet {
  const planet = { index: world.planetIndex, seed: world.worldSeed }
  return withOreRulesVersion(planet, world.oreRulesVersion)
}

/** The bore gun's optional state (tickets 313, 378, 379). */
export function boreFieldsOf(
  from: Pick<PortableState, 'bores' | 'struts' | 'groundedLines'>,
): Pick<PortableState, 'bores' | 'struts' | 'groundedLines'> {
  return {
    ...(from.bores === undefined ? {} : { bores: from.bores }),
    ...(from.struts === undefined ? {} : { struts: from.struts }),
    ...(from.groundedLines === undefined ? {} : { groundedLines: from.groundedLines }),
  }
}
