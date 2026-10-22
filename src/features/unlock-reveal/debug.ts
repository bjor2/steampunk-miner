/**
 * Read-only, so no command and no log line (docs/standards/feature-slices.md 3.14): the reveal
 * playing now as a browser spec reads it, never pixels: the bought item, its ticks, the part
 * slots glowing on the car, and whether its gear hangs there only for the reveal. `holdReveal` and
 * `letRevealRun` keep a reveal up past its time for a spec or a shot (UI state only).
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { readAuthorityState } from '../../store/authorityLink'
import { revealOnRigAt } from './scene/revealOnRigSources'
import { useRevealStore } from './store/revealStore'

export const unlockRevealDebugActions: Readonly<Record<string, DebugAction>> = {
  holdReveal: () => {
    useRevealStore.getState().holdReveal()
    return { ok: true }
  },
  letRevealRun: () => {
    useRevealStore.getState().letRevealRun()
    return { ok: true }
  },
  getReveal: () => {
    const { reveal } = useRevealStore.getState()
    const tick = readAuthorityState().tick
    const onRig = revealOnRigAt(tick)
    return {
      ok: true,
      isPlaying: reveal !== null,
      isHeld: useRevealStore.getState().isHeld,
      item: reveal === null ? null : `${reveal.revealed.item.kind}:${reveal.revealed.item.id}`,
      name: reveal?.revealed.name ?? null,
      startTick: reveal?.startTick ?? null,
      endTick: reveal?.endTick ?? null,
      glowSlots: onRig?.glowSlots ?? [],
      isHung: (onRig?.hang.length ?? 0) > 0,
      tick,
    }
  },
}
