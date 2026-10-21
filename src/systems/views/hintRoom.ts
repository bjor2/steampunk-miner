/**
 * Where the compact hint chip goes and whether it may show (#500, GD rulings 2, 3 and 5): under
 * the HUD's top rows, across the width held upright and in the left column sideways (short of the
 * vehicle's keep-clear square); one line tall, at most 8% of the screen. It shows only while,
 * with its box added, the view keeps its clear floor, and it covers neither the vehicle's square,
 * the stick zone nor a touch button; otherwise it waits in the queue. Pure: the HUD hands it the
 * boxes it measured, in screen CSS px.
 */
import { HINT_CHIP_GAP_PX, HINT_CHIP_LINE_PX } from '../../constants/screen'
import {
  clearViewFloorOf,
  doBoxesOverlap,
  isHintRoomFor,
  vehicleKeepClearOf,
  type ScreenBox,
  type ScreenSize,
} from './hudClearView'
import { hintChipMaxHeightOf, type StageOrientation } from './screenLayout'

export interface HintRoomInput {
  screen: ScreenSize
  orientation: StageOrientation
  /** The area the HUD lays out in: the safe area. */
  safeArea: ScreenBox
  /** The HUD's top rows (the strip, the Tech tree, the prompts): the chip goes under them. */
  rows: readonly ScreenBox[]
  /** Every box that covers the view: the HUD's and the visible touch buttons. */
  covering: readonly ScreenBox[]
  /** Where the chip may never sit: the stick zone and the touch buttons. */
  keepOut: readonly ScreenBox[]
}

export interface HintRoom {
  /** The chip's box when it shows. */
  chip: ScreenBox
  hasRoom: boolean
}

export function hintRoomOf(input: HintRoomInput): HintRoom {
  const chip = hintChipBoxOf(input)
  const keepClear = vehicleKeepClearOf(input.screen)
  const floor = clearViewFloorOf(input.orientation)
  const isClearOfAll = [keepClear, ...input.keepOut].every((box) => !doBoxesOverlap(chip, box))
  const isWithinScreen = chip.bottom <= input.safeArea.bottom
  const hasRoom =
    isClearOfAll && isWithinScreen && isHintRoomFor(input.covering, chip, input.screen, floor)
  return { chip, hasRoom }
}

/** One line tall, at most 8% of the screen (GD ruling 4). */
export function hintChipHeightOf(screen: ScreenSize): number {
  return Math.min(HINT_CHIP_LINE_PX, hintChipMaxHeightOf(screen.height))
}

function hintChipBoxOf(input: HintRoomInput): ScreenBox {
  const span = hintSpanOf(input)
  const top = rowsEndOver(input.rows, span, input.safeArea.top) + HINT_CHIP_GAP_PX
  return { ...span, top, bottom: top + hintChipHeightOf(input.screen) }
}

/** Upright the safe width; sideways the left column, which stops short of the vehicle. */
function hintSpanOf(input: HintRoomInput): { left: number; right: number } {
  const left = input.safeArea.left + HINT_CHIP_GAP_PX
  const right =
    input.orientation === 'portrait'
      ? input.safeArea.right - HINT_CHIP_GAP_PX
      : vehicleKeepClearOf(input.screen).left - HINT_CHIP_GAP_PX
  return { left, right }
}

/** The lowest edge of the rows above the span, or the safe area's top with none there. */
function rowsEndOver(
  rows: readonly ScreenBox[],
  span: { left: number; right: number },
  safeTop: number,
): number {
  const above = rows.filter((row) => row.left < span.right && span.left < row.right)
  return Math.max(safeTop, ...above.map((row) => row.bottom))
}
