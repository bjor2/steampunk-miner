/**
 * The programmatic placeholder for the hand-authored vehicle (#13: brass, copper and iron, built
 * from layered parts, with 3 visual tiers swapped in at level thresholds). Flat shapes only, until
 * the commissioned art lands. Each tier adds parts, so an upgrade threshold shows on the vehicle
 * (principle 37.7). Sizes and offsets are metres in the body's frame; the collider is 0.9 m and
 * the art may overhang it (#7).
 */

export interface VehiclePart {
  id: string
  shape: 'box' | 'disc'
  /** Width and height; a disc uses the width as its diameter. */
  size: readonly [number, number]
  offset: readonly [number, number]
  colour: string
  /** Higher layers draw over lower ones. */
  layer: number
  /** The first visual tier (1 to 3, from `visualTier`) that shows this part. */
  fromTier: number
}

const IRON = '#3b3631'
const DARK_IRON = '#2a2623'
const COPPER = '#b87333'
const BRASS = '#c9a24b'
const DARK_BRASS = '#8a6a2f'
const STEEL = '#9aa0a6'
const PARCHMENT = '#e9dcc0'

export const VEHICLE_PLACEHOLDER_PARTS: readonly VehiclePart[] = [
  part('tracks', 'box', [1, 0.2], [0, -0.36], IRON, 0, 1),
  part('wheel_rear', 'disc', [0.24, 0.24], [-0.32, -0.36], DARK_IRON, 1, 1),
  part('wheel_mid', 'disc', [0.24, 0.24], [0, -0.36], DARK_IRON, 1, 1),
  part('wheel_front', 'disc', [0.24, 0.24], [0.32, -0.36], DARK_IRON, 1, 1),
  part('chassis', 'box', [0.9, 0.42], [0, -0.08], COPPER, 2, 1),
  part('boiler', 'disc', [0.42, 0.42], [-0.13, 0.2], BRASS, 3, 1),
  part('cab_window', 'box', [0.22, 0.16], [0.26, 0.04], PARCHMENT, 3, 1),
  part('stack', 'box', [0.1, 0.3], [-0.32, 0.38], IRON, 2, 1),
  part('stack_second', 'box', [0.1, 0.24], [-0.16, 0.44], IRON, 2, 2),
  part('gauge', 'disc', [0.13, 0.13], [0.06, 0.24], PARCHMENT, 4, 2),
  part('piston', 'box', [0.32, 0.06], [0.18, -0.22], STEEL, 4, 2),
  part('armour_top', 'box', [0.94, 0.08], [0, 0.14], DARK_BRASS, 5, 3),
  part('armour_side', 'box', [0.1, 0.38], [0.46, -0.08], DARK_BRASS, 5, 3),
  part('armour_rear', 'box', [0.1, 0.38], [-0.46, -0.08], DARK_BRASS, 5, 3),
]

/** The parts a vehicle of this visual tier shows, lowest layer first. */
export function vehiclePartsForTier(visualTier: number): VehiclePart[] {
  return VEHICLE_PLACEHOLDER_PARTS.filter((each) => each.fromTier <= visualTier).sort(
    (a, b) => a.layer - b.layer,
  )
}

function part(
  id: string,
  shape: VehiclePart['shape'],
  size: readonly [number, number],
  offset: readonly [number, number],
  colour: string,
  layer: number,
  fromTier: number,
): VehiclePart {
  return { id, shape, size, offset, colour, layer, fromTier }
}
