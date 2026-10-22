/**
 * `data-testid`s of the stage the canvas and UI share, the touch controls (#173), the device's
 * notice chips (ticket 478) and the unsupported-device card (ticket 477).
 * Apart from `UI_IDS`, which names what the screens' view models draw.
 */
export const DEVICE_UI_IDS = {
  gameStage: 'game-stage',
  safeArea: 'safe-area',
  unsupportedDeviceCard: 'unsupported-device-card',
  touchControls: 'touch-controls',
  touchStickZone: 'touch-stick-zone',
  touchStick: 'touch-stick',
  touchCluster: 'touch-cluster',
  touchPause: 'touch-pause',
  /** The size Plant charge plants, riding its tool slot cell (ticket 473, ticket 691). */
  chargeSizeBadge: 'charge-size-badge',
  deviceNotices: 'device-notices',
} as const

/** One button of the touch cluster, named for the action it presses. */
export function touchButtonIdOf(actionId: string): string {
  return `touch-${actionId}`
}
