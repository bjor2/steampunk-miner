/**
 * The hazards' scenario call (ticket 848): `debug.placeHazard {kind, tx, ty}` places a hazard of a
 * kind with a contact-effect row in one cell (`placedHazards.ts`), on any planet, so a spec meets
 * each of the four effects where it stands. Refused, never trimmed: a kind no row plays, or no
 * planet, and nothing is placed.
 */
import { contactEffectOf } from '../../registries/contactEffects'
import { firstRejection, rejectionOf, type CommandRule, type Rejection } from '../commandRule'
import { noPlanetRejection } from '../planetOfState'
import { withPlacedHazard } from './placedHazards'

export const HAZARD_DEBUG_RULES: {
  readonly 'debug.placeHazard': CommandRule<'debug.placeHazard'>
} = {
  'debug.placeHazard': {
    fields: { kind: 'text', tx: 'safeInteger', ty: 'safeInteger' },
    reject: (state, { payload }) =>
      firstRejection([
        () => noPlanetRejection(state.planet),
        () => unplayedKindRejection(payload.kind),
      ]),
    apply: (state, { payload }) => ({
      state: withPlacedHazard(state, { tx: payload.tx, ty: payload.ty }, payload.kind),
      events: [],
    }),
  },
}

/** The intent the debug API sends: a hazard of `kind` in the cell `tx, ty`. */
export function placeHazardCommand(kind: string, tx: number, ty: number) {
  return { type: 'debug.placeHazard' as const, payload: { kind, tx, ty } }
}

function unplayedKindRejection(kind: string): Rejection | null {
  if (contactEffectOf(kind) !== null) return null
  return rejectionOf('invalid_payload', `kind ${kind} has no contact-effect row`)
}
