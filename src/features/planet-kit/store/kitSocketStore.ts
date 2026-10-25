/**
 * What the kit sockets show on the car (tickets 823 and 825). Presentation only, like the example's
 * test piece (feature-slices.md 3.18): no player owns a kit tool before #850, so the debug actions
 * flip it for the eye check and the screen suite, with the flasks held and whether the tools act;
 * it is never saved, logged or part of `GameState`. #850 drives it from the owned and stack state.
 */
import { create } from 'zustand'
import { KIT_SOCKET_ALL_SHOWN, type KitSocketShow } from '../systems/render/kitSocketLook'

interface KitSocketState {
  areShown: boolean
  show: KitSocketShow
}

export const useKitSocketStore = create<KitSocketState>(() => ({
  areShown: false,
  show: KIT_SOCKET_ALL_SHOWN,
}))

/** Hangs every kit tool on the car; by default with every flask held and the tools acting. */
export function showKitSockets(show: KitSocketShow = KIT_SOCKET_ALL_SHOWN): void {
  useKitSocketStore.setState({ areShown: true, show })
}

export function hideKitSockets(): void {
  useKitSocketStore.setState({ areShown: false })
}

export function resetKitSocketStore(): void {
  useKitSocketStore.setState({ areShown: false, show: KIT_SOCKET_ALL_SHOWN })
}
