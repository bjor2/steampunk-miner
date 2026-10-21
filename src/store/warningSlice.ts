/**
 * The game store's warning slice (spec #678, ticket 685; design section 7): the ladder watch over
 * the HUD's readings and the edge glow it holds. The HUD hands its readings in as it re-reads them;
 * a tier that fires is announced to the bells and the haptics (`warningBroadcast.ts`), and the
 * store keeps only what the screen draws, the glow, and the watch it steps from. UI state only:
 * never a command, a log line or part of the digest, and it does not hold play.
 */
import {
  ARMED_WARNING_WATCH,
  NO_EDGE_GLOW,
  stepWarningWatch,
  type EdgeGlow,
  type WarningReading,
  type WarningStep,
  type WarningWatch,
} from '../systems/views/warningWatch'
import { announceWarnings } from './warningBroadcast'

export interface WarningValues {
  warningWatch: WarningWatch
  edgeGlow: EdgeGlow
}

export interface WarningActions {
  /** One look at the HUD's readings: fires what fell into a tier and moves the glow. */
  followWarnings(readings: readonly WarningReading[]): void
}

type SetSlice = (partial: Partial<WarningValues>) => void

export const STARTING_WARNINGS: WarningValues = {
  warningWatch: ARMED_WARNING_WATCH,
  edgeGlow: NO_EDGE_GLOW,
}

export function warningActionsOf(set: SetSlice, get: () => WarningValues): WarningActions {
  return {
    followWarnings: (readings) => {
      const step = stepWarningWatch(get().warningWatch, readings)
      keepChangedWarnings(set, get(), step)
      announceWarnings(step.firings)
    },
  }
}

/** Sets only what changed, so a quiet re-read renders nothing. */
function keepChangedWarnings(set: SetSlice, shown: WarningValues, step: WarningStep): void {
  const isWatchChanged = !isSameWatch(shown.warningWatch, step.watch)
  const isGlowChanged = !isSameGlow(shown.edgeGlow, step.glow)
  if (!isWatchChanged && !isGlowChanged) return
  set({
    ...(isWatchChanged ? { warningWatch: step.watch } : {}),
    ...(isGlowChanged ? { edgeGlow: step.glow } : {}),
  })
}

function isSameWatch(shown: WarningWatch, next: WarningWatch): boolean {
  return Object.entries(next).every(([id, tier]) => shown[id as keyof WarningWatch] === tier)
}

function isSameGlow(shown: EdgeGlow, next: EdgeGlow): boolean {
  return shown.tier === next.tier && shown.readoutId === next.readoutId
}
