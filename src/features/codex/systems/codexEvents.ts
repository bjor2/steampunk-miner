/**
 * The codex's domain events (#172 section 3, GD rulings; #207): `codex.OreContacted` the first touch
 * of an ore type, a locked cell included; `codex.OreDiscovered` its first unit in the hold, which
 * drives the #178 plaque; `codex.EntryAdded` after each, a consequence and never a source. Each
 * comes once per player per type, inside the authority's answer that touched or mined it. An enemy
 * or hazard met for the first time (ticket 252) says only `codex.EntryAdded`, at `contacted`.
 */
import type { OreType } from '../../../systems/registries/oreTypes'

/** How a type was first touched: the drill's damage, a gate refusing or losing the cell, or a unit
 * reaching the hold untouched (a charge's blast). */
export type ContactRoute = 'drill' | 'gate' | 'cargo'

/** Which of the codex's two states an entry reached. */
export type CodexStage = 'contacted' | 'mined'

/** A type alias, not an interface, so it reads as the run log's plain record of fields. */
export type OreFacts = {
  oreId: string
  family: string
  tier: number
  grade: number
}

declare module '../../../systems/authority/domainEvent' {
  interface DomainEventBodies {
    'codex.OreContacted': OreFacts & { via: ContactRoute }
    'codex.OreDiscovered': OreFacts
    'codex.EntryAdded': { key: string; stage: CodexStage }
  }
}

export function oreFactsOf(ore: OreType): OreFacts {
  return { oreId: ore.id, family: ore.family, tier: ore.tier, grade: ore.grade }
}
