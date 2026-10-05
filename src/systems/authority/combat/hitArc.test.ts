import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FACING, facingVectorOf, type Facing } from '../../vehicle/vehiclePose'
import { hitArcOf, type HitArc } from './hitArc'

/** The body-up vector at four planet angles, scaled to 1024 and rounded as the shell sends it. */
const PLANET_UPS = [
  { upx: 0, upy: 1024 },
  { upx: 724, upy: 724 },
  { upx: -1024, upy: 0 },
  { upx: 627, upy: -810 },
]
const FACINGS: Facing[] = [FACING.left, FACING.right, FACING.down, FACING.up]

/**
 * Offsets in the drill's own frame, as multiples of the integer facing vector and its
 * perpendicular (about 1 m each), so 45 and 135 degrees stay exact in integer coordinates.
 */
const LOCAL_OFFSETS: { degrees: number; along: number; across: number }[] = [
  ...[0, 30, 60, 90, 120, 150, 180, 210, 240, 270].map((degrees) => ({
    degrees,
    along: Math.round(20 * Math.cos((degrees * Math.PI) / 180)),
    across: Math.round(20 * Math.sin((degrees * Math.PI) / 180)),
  })),
  { degrees: 45, along: 15, across: 15 },
  { degrees: 135, along: -15, across: 15 },
]

function expectedArc(degrees: number): HitArc {
  const fromAxis = Math.min(degrees % 360, 360 - (degrees % 360))
  if (fromAxis <= 45) return 'front'
  if (fromAxis >= 135) return 'rear'
  return 'side'
}

/** World offset for a local one: `along` the drill axis and `across` at right angles to it. */
function worldOffset(
  up: { upx: number; upy: number },
  facing: Facing,
  along: number,
  across: number,
) {
  const axis = facingVectorOf(up.upx, up.upy, facing)
  return { dx: along * axis.x - across * axis.y, dy: along * axis.y + across * axis.x }
}

describe('hit arc (#9 three-zone rule)', () => {
  it.each(LOCAL_OFFSETS)(
    'calls an offset at $degrees degrees from the drill axis the same arc at every facing and planet angle',
    ({ degrees, along, across }) => {
      for (const up of PLANET_UPS) {
        for (const facing of FACINGS) {
          const { dx, dy } = worldOffset(up, facing, along, across)
          expect(hitArcOf({ ...up, facing }, dx, dy)).toBe(expectedArc(degrees))
        }
      }
    },
  )

  it('counts exactly 45 degrees as front and exactly 135 degrees as rear', () => {
    const facingRight = { upx: 0, upy: 1024, facing: FACING.right }
    expect(hitArcOf(facingRight, 1000, 1000)).toBe('front')
    expect(hitArcOf(facingRight, 1000, -1000)).toBe('front')
    expect(hitArcOf(facingRight, -1000, 1000)).toBe('rear')
    expect(hitArcOf(facingRight, 1000, 1001)).toBe('side')
  })

  it('stays exact at the edge of the zone-test range', () => {
    const tilted = { upx: 1025, upy: 0, facing: FACING.up }
    expect(hitArcOf(tilted, 65535, 0)).toBe('front')
    expect(hitArcOf(tilted, -46340, 46340)).toBe('rear')
    expect(hitArcOf(tilted, 0, -65535)).toBe('side')
  })

  it('uses no trigonometry', () => {
    const source = readFileSync(new URL('./hitArc.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/Math\.(sin|cos|tan|asin|acos|atan|atan2|hypot)\b/)
  })
})
