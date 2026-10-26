/**
 * A client's refusal of a planet stamped with ore rules it does not know (ticket 890, the TD's rows
 * and HS 5 and 6 on #890). Clients generate their own terrain from the planet's stamp, so a client
 * renders a planet by its stamped rules, never its own newest: a join snapshot
 * (`sessionSnapshot.ts`, `planetOreStamps.ts`) or a travel event (`PlanetEntered`,
 * `PlanetGenerated`) whose stamp this build does not know is refused here, at the boundary, with
 * "update required". Nothing is re-picked and nothing falls back to this build's rules.
 */
import { isKnownOreRulesVersion } from '../world/planetParams'
import type { DomainEvent } from './domainEvent'

/** What a refused stamp tells the player to do. */
export const UPDATE_REQUIRED = 'update required'

/** The refusal of the unknown stamp at `path`. */
export function unknownOreRulesProblemOf(path: string): string {
  return `${path} is not ore rules this build knows: ${UPDATE_REQUIRED}`
}

/** Why a travel event cannot be rendered by this build; empty for any other event. */
export function travelStampProblems(event: DomainEvent): string[] {
  if (event.type !== 'PlanetEntered' && event.type !== 'PlanetGenerated') return []
  if (isKnownOreRulesVersion(event.oreRulesVersion)) return []
  return [unknownOreRulesProblemOf(`${event.type}.oreRulesVersion`)]
}
