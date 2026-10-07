/**
 * A blast still opening its crater (Technical Director, #154 and K6 #189): detonation resolves the
 * hits at once and leaves a live blast, whose ground breaks a slice a tick along its front
 * (`blastFront.ts`, `blastSlice.ts`). What it has done so far rides along, so its `blast_resolved`
 * line can sum it up and the kept ore share stays that of the whole blast. Plain JSON, oldest
 * first, so it is in the snapshot and the digest and a load mid-blast finishes the same crater;
 * emptied with the world on every planet.
 */
import type { BlastEvent } from '../../registries/blastEffects'
import type { AuthorityState } from '../authorityState'
import { isJsonObject, isWholeNumber } from '../payloadFields'

export interface LiveBlast {
  /** The blast as the slices' gates and effects are told it, at its detonation tick. */
  blast: BlastEvent
  /** Front tiles looked at so far; the next slice starts at this one. */
  cursor: number
  tilesCleared: number
  /** Ordinary ore units broken so far by sale tier (#232): the kept share is of the running total. */
  oreBrokenByTier: Readonly<Record<string, number>>
  /** Gated ore units a gate said are lost, by sale tier, and units a gate freed whole (K2). */
  oreLostByTier: Readonly<Record<string, number>>
  oreUnitsFreed: number
  /** Rim blocks checked so far (`blastCollapse.ts`), nearest first, and the warnings they started. */
  collapseChecks: number
  collapsesTriggered: number
}

export const NO_LIVE_BLASTS: readonly LiveBlast[] = []

/** The blast's ground starts breaking on its own tick, after every blast already live. */
export function startLiveBlast(state: AuthorityState, blast: BlastEvent): AuthorityState {
  return { ...state, liveBlasts: [...state.liveBlasts, liveBlastOf(blast)] }
}

function liveBlastOf(blast: BlastEvent): LiveBlast {
  return {
    blast,
    cursor: 0,
    tilesCleared: 0,
    oreBrokenByTier: {},
    oreLostByTier: {},
    oreUnitsFreed: 0,
    collapseChecks: 0,
    collapsesTriggered: 0,
  }
}

export function portableLiveBlastsOf(blasts: readonly LiveBlast[]): LiveBlast[] {
  return blasts.map((live) => ({
    ...live,
    blast: { ...live.blast },
    oreBrokenByTier: { ...live.oreBrokenByTier },
    oreLostByTier: { ...live.oreLostByTier },
  }))
}

export function portableLiveBlastsProblems(blasts: unknown, path: string): string[] {
  if (!Array.isArray(blasts)) return [`${path} must be a list of live blasts`]
  return blasts
    .map((live, index) => ({ live, index }))
    .filter(({ live }) => !isLiveBlast(live))
    .map(({ index }) => `${path}[${index}] is malformed`)
}

function isLiveBlast(live: unknown): live is LiveBlast {
  return (
    isJsonObject(live) &&
    isBlastEvent(live.blast) &&
    isWholeNumber(live.cursor) &&
    isWholeNumber(live.tilesCleared) &&
    isUnitsByTier(live.oreBrokenByTier) &&
    isUnitsByTier(live.oreLostByTier) &&
    isWholeNumber(live.oreUnitsFreed) &&
    isWholeNumber(live.collapseChecks) &&
    isWholeNumber(live.collapsesTriggered)
  )
}

function isBlastEvent(blast: unknown): boolean {
  return (
    isJsonObject(blast) &&
    Number.isSafeInteger(blast.tx) &&
    Number.isSafeInteger(blast.ty) &&
    isWholeNumber(blast.radiusMm) &&
    isWholeNumber(blast.size) &&
    typeof blast.playerId === 'string' &&
    typeof blast.source === 'string' &&
    isWholeNumber(blast.tick)
  )
}

function isUnitsByTier(units: unknown): boolean {
  return isJsonObject(units) && Object.values(units).every(isWholeNumber)
}
