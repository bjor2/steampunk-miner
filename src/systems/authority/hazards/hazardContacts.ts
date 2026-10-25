/**
 * The drill meets a hazard (ticket 848; the GD lock on #823 Q1, ticket 651's "one trigger"): every
 * cell the player's drill broke that holds a hazard kind with a contact-effect row plays the row's
 * effect on that rig alone, beside the electrified shock in the cut (`groundDrill.ts`), so the same
 * contact plays per vehicle for every player. A cell yields once, so it plays once.
 *
 * - `refill`, `bite` and `shove` play as the cell breaks (`hazardRefillContact.ts`,
 *   `hazardBiteContact.ts`, `hazardShove.ts`).
 * - `drain` plays while the rig stands in the cut pocket, settled on its commands
 *   (`hazardDrain.ts`), so breaking the cell does nothing yet.
 *
 * A contact whose factor (the row's, with any tool's hook, `contactEffects.ts`) is 0 plays nothing
 * and says nothing. Only the drill meets a hazard: a blast, a bore shot or a terrain edit breaking
 * the cell does not.
 */
import { contactEffectOf, contactFactorBpOf } from '../../registries/contactEffects'
import type { YieldedCell } from '../../world/cellYield'
import type { PlanetParams } from '../../world/planetParams'
import type { AuthorityState } from '../authorityState'
import { chainEffects, unchanged, type RuleEffect } from '../commandRule'
import type { CellContact } from './cellContact'
import { hazardKindOfCell } from './hazardCells'
import { biteOnContact } from './hazardBiteContact'
import { refillOnContact } from './hazardRefillContact'
import { shoveOnContact } from './hazardShove'

export function meetHazardContacts(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  broken: readonly YieldedCell[],
): RuleEffect {
  const contacts = broken.flatMap((cell) => contactOfCell(state, playerId, params, cell))
  if (contacts.length === 0) return unchanged(state)
  return chainEffects(
    state,
    contacts.map(
      (contact) => (current: AuthorityState) => playCutContact(current, playerId, params, contact),
    ),
  )
}

/** The cell's contact, or none: no kind, no row for the kind, or a factor of 0. */
function contactOfCell(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  { tile, cell }: YieldedCell,
): CellContact[] {
  const kind = hazardKindOfCell(state, params, tile, cell)
  const row = kind === null ? null : contactEffectOf(kind)
  if (row === null) return []
  const factorBp = contactFactorBpOf(state, playerId, row)
  return factorBp === 0 ? [] : [{ tile, row, factorBp }]
}

function playCutContact(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  contact: CellContact,
): RuleEffect {
  const { row } = contact
  switch (row.effect) {
    case 'refill':
      return refillOnContact(state, playerId, params, { ...contact, row })
    case 'bite':
      return biteOnContact(state, playerId, params, { ...contact, row })
    case 'shove':
      return shoveOnContact(state, playerId, params, { ...contact, row })
    case 'drain':
      return unchanged(state)
  }
}
