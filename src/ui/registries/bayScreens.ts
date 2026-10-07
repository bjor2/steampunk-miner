/**
 * A slice that owns a bay's screen (#180 Workshop showcase; K-b ticket 227, TD lock on #177): one
 * screen per bay, drawn by `PlatformScreen` in place of the kernel's markup as a transparent,
 * pointer-taking layer over the scene, behind the same shutter. The slice reads its own store and
 * the kernel's reads, and keeps the #33 screen ids on the rows it moves by drawing the kernel's row
 * views (`ui/platform`). A screen for a scheduled facility or module shows only once its schedule
 * row has opened (`FeatureUnlocked`, so a vision row never shows); until then the bay draws what it
 * always did. With no screen registered every bay draws exactly as before.
 */
import type { ComponentType } from 'react'
import type { AuthorityState } from '../../systems/authority/authorityState'
import { isFeatureUnlocked } from '../../systems/authority/featureUnlocks'
import { defineRegistry, entriesOf, type SealedRegistration } from '../../systems/registries/seal'
import { LOCKED_SCHEDULE } from '../../systems/unlocks/unlockSchedule'
import type { BayId } from '../../systems/world/dockBays'

export interface SliceBayScreen {
  id: string
  bay: BayId
  /** The schedule row (stats.json) that must be open before it shows; null for a bay open from the start. */
  featureId: string | null
  /** Takes no props: it reads its own slice store. */
  Screen: ComponentType
}

export const BAY_SCREEN_REGISTRY = defineRegistry<SliceBayScreen>(
  'bayScreens',
  bayScreenSealProblem,
)

/** The id of the slice screen `bay` shows on `state`'s planet, or null for the kernel's own. */
export function shownBayScreenIdOf(state: AuthorityState, bay: BayId): string | null {
  const screen = entriesOf(BAY_SCREEN_REGISTRY).find((candidate) => candidate.bay === bay)
  return screen !== undefined && isOpen(state, screen) ? screen.id : null
}

/** The registered screen `id`, or null. */
export function bayScreenById(id: string): SliceBayScreen | null {
  return entriesOf(BAY_SCREEN_REGISTRY).find((screen) => screen.id === id) ?? null
}

function isOpen(state: AuthorityState, screen: SliceBayScreen): boolean {
  return screen.featureId === null || isFeatureUnlocked(state, screen.featureId)
}

function bayScreenSealProblem(
  registrations: readonly SealedRegistration<SliceBayScreen>[],
): string | null {
  const screens = registrations.map(({ entry }) => entry)
  const problems = [...secondScreenProblems(screens), ...unscheduledFeatureProblems(screens)]
  return problems.length === 0 ? null : problems.join('; ')
}

function secondScreenProblems(screens: readonly SliceBayScreen[]): string[] {
  return screens
    .filter((screen, at) => screens.findIndex((first) => first.bay === screen.bay) !== at)
    .map((screen) => `bay screen "${screen.id}" is a second screen for the ${screen.bay} bay`)
}

function unscheduledFeatureProblems(screens: readonly SliceBayScreen[]): string[] {
  return screens
    .filter((screen) => screen.featureId !== null && !isScheduledRow(screen.featureId))
    .map((screen) => `bay screen "${screen.id}" waits on "${screen.featureId}", no schedule row`)
}

function isScheduledRow(featureId: string): boolean {
  return LOCKED_SCHEDULE.rows.some((row) => row.id === featureId)
}
