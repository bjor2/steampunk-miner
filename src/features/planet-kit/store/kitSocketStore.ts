/**
 * Whether the kit sockets' placeholder parts show on the car (ticket 823). Presentation only, like
 * the example's test piece (feature-slices.md 3.18): no player owns a kit tool before #850, so the
 * debug actions flip it for the eye check and the screen suite; it is never saved, logged or part
 * of `GameState`.
 */
import { create } from 'zustand'

interface KitSocketState {
  areShown: boolean
}

export const useKitSocketStore = create<KitSocketState>(() => ({ areShown: false }))

export function showKitSockets(): void {
  useKitSocketStore.setState({ areShown: true })
}

export function hideKitSockets(): void {
  useKitSocketStore.setState({ areShown: false })
}

export function resetKitSocketStore(): void {
  hideKitSockets()
}
