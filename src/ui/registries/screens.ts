/**
 * Full screens a slice adds (#165 Q3 lock, ticket 211), registered and sealed like `hudPanels`:
 * the kernel shell draws at most one, over the HUD and the dock screen, and Escape (`ui_cancel`,
 * the existing back action) dismisses it. Presentation only: opening one submits no command and
 * changes no authority state, snapshot or digest. A screen reads its own slice store.
 */
import type { ComponentType } from 'react'
import { defineRegistry, entriesOf } from '../../systems/registries/seal'

export type ScreenSlot = 'full'

/** What the shell hands the screen it draws: the one way back, as its own back button. */
export interface ScreenProps {
  onDismiss: () => void
}

export interface ScreenPanel {
  id: string
  /** When two screens ask to be open, the higher priority is the one drawn. */
  priority: number
  render: ComponentType<ScreenProps>
}

export const SCREEN_REGISTRY = defineRegistry<ScreenPanel>('screens')

/** The slot's screens, sorted by id. Every screen is `full` today. */
export function screensOf(_slot: ScreenSlot): readonly ScreenPanel[] {
  return entriesOf(SCREEN_REGISTRY)
}

export function screenById(id: string): ScreenPanel | null {
  return screensOf('full').find((screen) => screen.id === id) ?? null
}

/**
 * The screen to keep open when `requestedId` asks while `openId` is: the higher priority, and
 * on a tie the newer request.
 */
export function winningScreenId(openId: string | null, requestedId: string): string {
  const open = openId === null ? null : screenById(openId)
  const requested = screenById(requestedId)
  if (open === null || requested === null) return requestedId
  return open.priority > requested.priority ? open.id : requestedId
}

/** Why `id` names no registered screen; empty when it does. */
export function screenIdProblems(id: unknown): string[] {
  if (typeof id !== 'string') return ['a screen id is a string']
  return screenById(id) === null ? [`no slice registered the screen "${id}"`] : []
}
