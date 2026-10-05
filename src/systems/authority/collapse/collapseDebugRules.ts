/**
 * Collapse's `debug.*` command (#43 Debug API): `forceCollapse(block)` starts the named block's
 * collapse now, as if its lining were weak, and holds it whatever the lining or the vehicles do,
 * so a scenario can show the full 60-tick telegraph and the refill. A block already collapsing is
 * held as it is, on its own clock. Like play it goes through `applyCommand`, replays from
 * `commands.ndjson` and logs `debug_command_applied`.
 */
import { blockOfId, type CollapseBlock } from '../../world/collapseBlock'
import { withCollapse, type AuthorityState } from '../authorityState'
import {
  firstRejection,
  rejectionOf,
  unchanged,
  type CommandRule,
  type Rejection,
  type RuleEffect,
} from '../commandRule'
import { noPlanetRejection, planetParamsOf } from '../planetOfState'
import { entryOfBlock, withCollapsingBlock } from './collapseState'
import { forcedWeaknessOf, startWarning } from './collapseWatch'

export const COLLAPSE_DEBUG_RULES: {
  readonly 'debug.forceCollapse': CommandRule<'debug.forceCollapse'>
} = {
  'debug.forceCollapse': {
    fields: { block: 'text' },
    reject: (state, { payload }) =>
      firstRejection([
        () => noPlanetRejection(state.planet),
        () => blockIdRejection(payload.block),
      ]),
    apply: (state, { payload }) => forceCollapse(state, payload.block),
  },
}

function blockIdRejection(id: string): Rejection | null {
  if (blockOfId(id) !== null) return null
  return rejectionOf('invalid_payload', `block must be "cx,cy#index" (index 0 to 63), got "${id}"`)
}

function forceCollapse(state: AuthorityState, id: string): RuleEffect {
  const params = planetParamsOf(state.planet)
  const block = blockOfId(id) as CollapseBlock
  const known = entryOfBlock(state.collapse, id)
  if (params === null) return unchanged(state)
  if (known !== null) {
    return unchanged(
      withCollapse(state, withCollapsingBlock(state.collapse, { ...known, isForced: true })),
    )
  }
  return startWarning(state, { block, weakness: forcedWeaknessOf(state, params, block) }, true)
}
