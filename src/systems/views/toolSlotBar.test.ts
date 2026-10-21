import { describe, expect, it } from 'vitest'
import type { ToolFace } from '../input/toolSlots'
import { chargeBadgeTextOf, nextTrayPageOf, toolBarLayoutOf, type ShownTool } from './toolSlotBar'

// The tool slot bar's layout (ticket 691, the HS kinds of #678): 4 thumb cells and an overflow
// tray on a phone, cell n at position n with Digit n on desktop and the tray past 8.

const FACE: ToolFace = {
  iconId: 'icon-probe',
  name: 'Probe',
  cooldownPercent: 0,
  chargesLeft: 0,
  chargesMax: 0,
  isOn: false,
  isActing: false,
}

const toolAt = (position: number): ShownTool => ({
  rowId: `probe.${position}`,
  position,
  face: FACE,
})
const positionsOf = (cells: readonly (ShownTool | null)[]) =>
  cells.map((cell) => cell?.position ?? null)

describe('tool slot bar layout', () => {
  it('draws no bar while no tool is shown', () => {
    expect(toolBarLayoutOf([], 'phone', 0)).toBeNull()
    expect(toolBarLayoutOf([], 'desktop', 0)).toBeNull()
  })

  it('fills the phone thumb cells with the first four tools by position, the rest in the tray', () => {
    const layout = toolBarLayoutOf([9, 2, 7, 1, 10, 5].map(toolAt), 'phone', 0)
    expect(positionsOf(layout!.cells)).toEqual([1, 2, 5, 7])
    expect(layout!.tray).toEqual({ page: 0, pages: 1 })
  })

  it('leaves the remaining phone cells empty and shows no overflow under five tools', () => {
    const layout = toolBarLayoutOf([9, 3].map(toolAt), 'phone', 0)
    expect(positionsOf(layout!.cells)).toEqual([3, 9, null, null])
    expect(layout!.tray).toBeNull()
  })

  it('keeps cell n at position n on desktop, so Digit n always meets the same cell', () => {
    const layout = toolBarLayoutOf([3, 8, 1].map(toolAt), 'desktop', 0)
    expect(positionsOf(layout!.cells)).toEqual([1, null, 3, null, null, null, null, 8])
    expect(layout!.tray).toBeNull()
  })

  it('puts desktop positions past 8 in the tray behind the overflow cell', () => {
    const layout = toolBarLayoutOf([1, 9, 10].map(toolAt), 'desktop', 0)
    expect(positionsOf(layout!.cells)).toEqual([1, null, null, null, null, null, null, null])
    expect(layout!.tray).toEqual({ page: 0, pages: 1 })
  })

  it('opens the tray in place: its tools fill the cells, padded with empty wells', () => {
    const layout = toolBarLayoutOf([1, 2, 3, 4, 5, 6].map(toolAt), 'phone', 1)
    expect(positionsOf(layout!.cells)).toEqual([5, 6, null, null])
    expect(layout!.tray).toEqual({ page: 1, pages: 1 })
  })

  it('pages a tray longer than the cells, then turns back to the thumb cells', () => {
    const tools = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(toolAt)
    const first = toolBarLayoutOf(tools, 'phone', 1)!
    expect(positionsOf(first.cells)).toEqual([5, 6, 7, 8])
    const second = toolBarLayoutOf(tools, 'phone', nextTrayPageOf(first.tray!))!
    expect(positionsOf(second.cells)).toEqual([9, 10, null, null])
    expect(nextTrayPageOf(second.tray!)).toBe(0)
  })

  it('falls back to the thumb cells when the open page no longer has tools', () => {
    const layout = toolBarLayoutOf([1, 2].map(toolAt), 'phone', 2)
    expect(positionsOf(layout!.cells)).toEqual([1, 2, null, null])
    expect(layout!.tray).toBeNull()
  })
})

describe('tool slot charges badge', () => {
  it('counts the charges left once a tool holds more than one, and none for one or none', () => {
    expect(chargeBadgeTextOf({ ...FACE, chargesLeft: 2, chargesMax: 3 })).toBe('2')
    expect(chargeBadgeTextOf({ ...FACE, chargesLeft: 0, chargesMax: 3 })).toBe('0')
    expect(chargeBadgeTextOf({ ...FACE, chargesLeft: 1, chargesMax: 1 })).toBeNull()
    expect(chargeBadgeTextOf(FACE)).toBeNull()
  })

  it('shortens a large count through the shared formatter', () => {
    expect(chargeBadgeTextOf({ ...FACE, chargesLeft: 12_345, chargesMax: 20_000 })).toBe('12.3k')
  })
})
