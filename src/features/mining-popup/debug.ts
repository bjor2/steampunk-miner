/**
 * Read-only, so no command and no log line (feature-slices.md 3.14): what the popup shows at the
 * tick it was last aged to, so a browser spec checks chips and the plaque as state, not pixels.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { useMiningPopupStore } from './store/miningPopupStore'
import { chipsShownAt } from './systems/chipBoard'
import { plaquePhaseAt, plaqueShownAt } from './systems/plaqueBoard'

export const miningPopupDebugActions: Readonly<Record<string, DebugAction>> = {
  getShown: () => {
    const { chipBoard, plaqueBoard, tick } = useMiningPopupStore.getState()
    const plaque = plaqueShownAt(plaqueBoard, tick)
    return {
      ok: true,
      tick,
      chips: chipsShownAt(chipBoard, tick).map(({ face, count, slot, isNamed }) => ({
        oreId: face.oreId,
        count,
        slot,
        isNamed,
      })),
      plaque:
        plaque === null
          ? null
          : {
              oreIds: plaque.materials.map(({ face }) => face.oreId),
              phase: plaquePhaseAt(plaque, tick),
            },
      plaquesShown: plaqueBoard.nextSerial,
    }
  },
}
