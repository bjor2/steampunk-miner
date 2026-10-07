/**
 * What a reached Mark milestone adds to an item's look (ticket 277; the GD lock on #256: "every
 * milestone steps the Mark plate and changes one visible FX element of the effect"). Each of the
 * three milestone Marks changes one element of every effect the item draws, and the changes stack,
 * so a player reads the item's Mark off its effect without the card: Mark 3 tints the motes toward
 * the plate's gilt, Mark 6 doubles the strands, Mark 9 draws each mote larger. Reach, duration and
 * where the effect flows stay the table's, because those show what the item does, which a
 * milestone never changes. Stand-in dressing on the procedural motes until the Blender pass.
 * Render-only: nothing here reaches the authority, a snapshot or a digest.
 */
import { mixRgb, rgbOfHex, type Rgb } from '../../../../systems/render/colour'
import type { MarkMilestone } from '../techNode'
import { GILT_COLOUR } from './markPlate'
import type { PowerUpFx } from './techGear'

/** The one element each milestone Mark changes (the tree shape test keeps milestones on 3, 6, 9). */
export type FxElement = 'tint' | 'strands' | 'moteSize'

export const MILESTONE_FX_ELEMENTS: Readonly<Record<number, FxElement>> = {
  3: 'tint',
  6: 'strands',
  9: 'moteSize',
}

/** How an effect's motes draw: the table's colour and scale 1 for both until a milestone changes one. */
export interface FxLook {
  colour: string
  strandScale: number
  moteScale: number
}

/** Halfway to the plate's gilt keeps the effect's own hue readable under the brass. */
const TINT_SHARE = 0.5
const STRAND_SCALE = 2
const MOTE_SCALE = 2
const CHANNEL_MAX = 255

export function plainLookOf(fx: PowerUpFx): FxLook {
  return { colour: fx.colour, strandScale: 1, moteScale: 1 }
}

/** The effect's look with each reached milestone's element changed. */
export function fxLookOf(fx: PowerUpFx, reached: readonly MarkMilestone[]): FxLook {
  return reached.reduce(changeElement, plainLookOf(fx))
}

function changeElement(look: FxLook, milestone: MarkMilestone): FxLook {
  const element = MILESTONE_FX_ELEMENTS[milestone.mark]
  if (element === 'tint') return { ...look, colour: tintedTowardGilt(look.colour) }
  if (element === 'strands') return { ...look, strandScale: STRAND_SCALE }
  if (element === 'moteSize') return { ...look, moteScale: MOTE_SCALE }
  return look
}

function tintedTowardGilt(colour: string): string {
  return hexOfRgb(mixRgb(rgbOfHex(colour), rgbOfHex(GILT_COLOUR), TINT_SHARE))
}

function hexOfRgb(rgb: Rgb): string {
  const channel = (value: number) =>
    Math.round(value * CHANNEL_MAX)
      .toString(16)
      .padStart(2, '0')
  return `#${rgb.map(channel).join('')}`
}
