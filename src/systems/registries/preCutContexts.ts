/**
 * Tools that act by context (ticket 881; the GD lock on #850, the TD's `preCutContext` seam): a
 * slice names, for a player, each owned tool and whether the rig is in that tool's context now,
 * read at the rig's position before the drill cuts in the same command, so the tool's factor and
 * its trade-off apply to that cut (`authority/hazards/toolContexts.ts`). The kernel keeps the
 * acting flag and a tool's tail: it acts on for `tailTicks` after its context was last seen
 * (G&V's 0.5 s hysteresis), and each change is one `ToolActingChanged`.
 *
 * A hook answers nothing while the player owns none of its tools, so a rig with no tool reads no
 * world here and plays byte-identically.
 */
import type { AuthorityState } from '../authority/authorityState'
import type { PlanetParams } from '../world/planetParams'
import { defineRegistry, entriesOf } from './seal'

/** Where the rig stands, in mm of the planet frame: the centre of its drill reach. */
export interface RigAt {
  x: number
  y: number
}

/** One owned tool and whether its context is at the rig now. */
export interface ToolContext {
  /** The tool's id, `<slice>.<tool>`, as its trade-off row and `actingTools` name it. */
  toolId: string
  isInContext: boolean
}

export interface PreCutContext {
  id: string
  /** The ticks a tool keeps acting after its context was last seen. */
  tailTicks: number
  /** The player's owned tools with their context at `at`; empty while it owns none. */
  toolContextsOf(
    state: AuthorityState,
    playerId: string,
    params: PlanetParams,
    at: RigAt,
  ): readonly ToolContext[]
}

export const PRE_CUT_CONTEXT_REGISTRY = defineRegistry<PreCutContext>('preCutContexts', (rows) =>
  tailProblemOf(rows.map(({ entry }) => entry)),
)

export function preCutContexts(): readonly PreCutContext[] {
  return entriesOf(PRE_CUT_CONTEXT_REGISTRY)
}

function tailProblemOf(hooks: readonly PreCutContext[]): string | null {
  const bad = hooks.filter((hook) => !Number.isSafeInteger(hook.tailTicks) || hook.tailTicks < 0)
  if (bad.length === 0) return null
  return `pre-cut contexts refused: ${bad.map((hook) => hook.id).join(', ')} need whole tailTicks from 0`
}
