/** Maps held keys (`KeyboardEvent.code`) to the horizontal throttle, -1 (left) .. 1 (right). */

const LEFT_KEYS = ['KeyA', 'ArrowLeft']
const RIGHT_KEYS = ['KeyD', 'ArrowRight']

export function throttleFromKeys(pressed: ReadonlySet<string>): number {
  return axisOf(pressed, RIGHT_KEYS) - axisOf(pressed, LEFT_KEYS)
}

function axisOf(pressed: ReadonlySet<string>, keys: readonly string[]): number {
  return keys.some((key) => pressed.has(key)) ? 1 : 0
}
