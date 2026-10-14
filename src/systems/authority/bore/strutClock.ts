/**
 * Struts on the authority's clock (ticket 379): a strut stands until its `untilTick`, and on that
 * tick, after the bores and before the collapse step, it leaves the state, so a refill due the same
 * tick already sees its mouth unreinforced. Its fall raises no event: `strut_placed` logged the tick.
 */
import type { AuthorityState } from '../authorityState'
import type { TickOutcome } from '../combat/combatTick'
import { strutsOf, withStruts, type BoreStrut } from './strutState'

/** The next tick a strut falls; null with none standing. */
export function nextStrutTick(state: AuthorityState): number | null {
  const ticks = Object.values(strutsOf(state)).map((strut) =>
    Math.max(strut.untilTick, state.tick + 1),
  )
  return ticks.length === 0 ? null : Math.min(...ticks)
}

/** The state without the struts whose time is up by `tick`. */
export function takeFallenStruts(state: AuthorityState, tick: number): TickOutcome {
  const struts = strutsOf(state)
  const standing = Object.entries(struts).filter(([, strut]) => isStanding(strut, tick))
  if (standing.length === Object.keys(struts).length) return { state, events: [] }
  return { state: withStruts(state, Object.fromEntries(standing)), events: [] }
}

function isStanding(strut: BoreStrut, tick: number): boolean {
  return tick < strut.untilTick
}
