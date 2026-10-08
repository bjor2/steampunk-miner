/**
 * The collapse watch after every accepted command (decision #43 Sequence 1): warnings that no
 * longer hold are cancelled, weak blocks near a vehicle start their telegraph, then the braces
 * are brought in line (ticket 331), so a command that ends a brace, such as a slot release, is
 * seen on its own tick.
 */
import type { AuthorityState } from '../authorityState'
import { chainEffects, unchanged, type RuleEffect } from '../commandRule'
import { planetParamsOf } from '../planetOfState'
import { syncCollapseBraces } from './collapseBraceSync'
import { cancelUnheldWarnings, warnWeakBlocksNearVehicles } from './collapseWatch'

export function followCollapse(state: AuthorityState): RuleEffect {
  const params = planetParamsOf(state.planet)
  if (params === null) return unchanged(state)
  return chainEffects(state, [
    (current) => cancelUnheldWarnings(current, params),
    (current) => warnWeakBlocksNearVehicles(current, params),
    (current) => syncCollapseBraces(current, current.tick, 'afterCollapseStep'),
  ])
}
