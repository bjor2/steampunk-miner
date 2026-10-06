/**
 * `data-testid`s of the stage the canvas and UI share, the portrait card and the touch controls
 * (#173). Apart from `UI_IDS`, which names what the screens' view models draw.
 */
export const DEVICE_UI_IDS = {
  gameStage: 'game-stage',
  safeArea: 'safe-area',
  portraitCard: 'portrait-card',
  touchControls: 'touch-controls',
  touchStickZone: 'touch-stick-zone',
  touchStick: 'touch-stick',
  touchCluster: 'touch-cluster',
} as const

/** One button of the touch cluster, named for the action it presses. */
export function touchButtonIdOf(actionId: string): string {
  return `touch-${actionId}`
}
