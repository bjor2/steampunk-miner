import { describe, expect, it } from 'vitest'
import type { GateRouteBlock } from '../systems/bot/gateRouteBlocks'
import { gateRouteStallTableOf, gateRouteStallWarnings } from './gateRouteStalls'

// The bot's gate_blocked_no_route per seed (GD ruling on ticket 237): wanted 0 on every seed.

const WALL: GateRouteBlock = {
  planet: 9,
  tx: 3,
  ty: -40,
  gateKind: 'rig',
  required: 'rig.resonance',
}

describe('gate route stalls', () => {
  it('prints each seed with its count and walls, and warns of none at 0', () => {
    expect(gateRouteStallTableOf([[], []], [1, 2])).toContain('| 1 | 0 | none |')
    expect(gateRouteStallWarnings([[], []], [1, 2])).toEqual([])
  })

  it('warns for every seed whose bot met a wall it could not open on its way down', () => {
    expect(gateRouteStallWarnings([[], [WALL]], [1, 2])).toEqual([
      'seed 2: gate_blocked_no_route is 1, wanted 0 (P9: (3, -40) rig.resonance)',
    ])
  })
})
