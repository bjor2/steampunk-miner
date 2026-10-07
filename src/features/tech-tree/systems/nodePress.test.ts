import { describe, expect, it } from 'vitest'
import { hasPressSlid, NODE_PRESS_SLOP_PX, nodePressStartedOn } from './nodePress'

const NODE = 'tech.sensing.echo_sounder'

describe('tree node press', () => {
  it('starts a hold for a touch or a pen, never for a mouse', () => {
    const at = { x: 40, y: 80 }
    expect(nodePressStartedOn(NODE, { pointerType: 'touch', ...at })).toEqual({
      nodeId: NODE,
      startX: 40,
      startY: 80,
    })
    expect(nodePressStartedOn(NODE, { pointerType: 'pen', ...at })).not.toBeNull()
    expect(nodePressStartedOn(NODE, { pointerType: 'mouse', ...at })).toBeNull()
  })

  it('keeps a wobbling thumb on the node and counts a longer slide as scrolling', () => {
    const press = { nodeId: NODE, startX: 40, startY: 80 }
    const movedTo = (x: number, y: number) => hasPressSlid(press, { pointerType: 'touch', x, y })
    expect(movedTo(46, 88)).toBe(false)
    expect(movedTo(40, 80 + NODE_PRESS_SLOP_PX)).toBe(false)
    expect(movedTo(40, 80 + NODE_PRESS_SLOP_PX + 1)).toBe(true)
  })
})
