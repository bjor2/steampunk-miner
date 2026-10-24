import { describe, expect, it } from 'vitest'
import { AIM_STEPS_PER_TURN, UP_VECTOR_SCALE } from '../../constants/physics'
import {
  AIM,
  aimDirectionOf,
  aimFieldsOf,
  aimOfFacing,
  aimOfPose,
  aimTurnOf,
  aimVectorOf,
  facingOfAim,
  isAim,
  isAlongUpAim,
  isCardinalAim,
  isDownwardAim,
  isSidewaysAim,
} from './aim'
import { FACING, facingVectorOf, type Facing } from './vehiclePose'

const FACINGS: readonly Facing[] = [FACING.left, FACING.right, FACING.down, FACING.up]
const UP_VECTORS = [
  { x: 0, y: 1024 },
  { x: 1024, y: 0 },
  { x: -724, y: 724 },
  { x: 512, y: -887 },
  { x: 0, y: -1024 },
  { x: 37, y: 1023 },
]
const ALL_AIMS = Array.from({ length: AIM_STEPS_PER_TURN }, (_, aim) => aim)

describe('drill aim', () => {
  it('maps the four facings to the cardinal aims and back', () => {
    expect(FACINGS.map(aimOfFacing)).toEqual([AIM.left, AIM.right, AIM.down, AIM.up])
    expect(FACINGS.map((facing) => facingOfAim(aimOfFacing(facing)))).toEqual(FACINGS)
  })

  it('gives a cardinal aim the very vector its facing gives, for any up vector', () => {
    for (const up of UP_VECTORS) {
      for (const facing of FACINGS) {
        expect(aimVectorOf(up.x, up.y, aimOfFacing(facing))).toEqual(
          facingVectorOf(up.x, up.y, facing),
        )
      }
    }
  })

  it('points every aim along the cosine and sine of its angle, within one at the 1024 scale', () => {
    for (const aim of ALL_AIMS) {
      const angle = (aim / AIM_STEPS_PER_TURN) * 2 * Math.PI
      const { along, up } = aimDirectionOf(aim)
      expect(Math.abs(along - UP_VECTOR_SCALE * Math.cos(angle))).toBeLessThanOrEqual(0.5)
      expect(Math.abs(up - UP_VECTOR_SCALE * Math.sin(angle))).toBeLessThanOrEqual(0.5)
    }
  })

  it('turns the aim with the up vector, so a diagonal on a tilted planet stays a unit vector', () => {
    for (const up of UP_VECTORS) {
      for (const aim of ALL_AIMS) {
        const { x, y } = aimVectorOf(up.x, up.y, aim)
        expect(Math.abs(Math.hypot(x, y) - UP_VECTOR_SCALE)).toBeLessThanOrEqual(2)
      }
    }
  })

  it('points down-right between the facings right and down, at the planet top', () => {
    expect(aimVectorOf(0, 1024, 56)).toEqual({ x: 724, y: -724 })
    expect(aimVectorOf(0, 1024, 8)).toEqual({ x: 724, y: 724 })
  })

  it('reads a diagonal halfway between two facings as its side', () => {
    expect([8, 24, 40, 56].map(facingOfAim)).toEqual([
      FACING.right,
      FACING.left,
      FACING.left,
      FACING.right,
    ])
    expect([9, 23, 41, 55].map(facingOfAim)).toEqual([
      FACING.up,
      FACING.up,
      FACING.down,
      FACING.down,
    ])
  })

  it('tells the cardinal, sideways, along-up and downward aims apart', () => {
    expect(ALL_AIMS.filter(isCardinalAim)).toEqual([0, 16, 32, 48])
    expect(ALL_AIMS.filter(isSidewaysAim)).toEqual([0, 32])
    expect(ALL_AIMS.filter(isAlongUpAim)).toEqual([16, 48])
    expect(ALL_AIMS.filter(isDownwardAim)).toEqual(ALL_AIMS.filter((aim) => aim > 32))
  })

  it('turns the short way, a half turn counter-clockwise', () => {
    expect(aimTurnOf(0, 8)).toBe(8)
    expect(aimTurnOf(0, 56)).toBe(-8)
    expect(aimTurnOf(60, 2)).toBe(6)
    expect(aimTurnOf(0, 32)).toBe(32)
    expect(aimTurnOf(48, 16)).toBe(32)
  })

  it('accepts only whole steps of one turn', () => {
    expect([0, 63, 17].every(isAim)).toBe(true)
    expect([-1, 64, 1.5, '8', null].some(isAim)).toBe(false)
  })

  it('reads a pose with no aim at its facing, as every pose before protocol 107', () => {
    expect(aimOfPose({ facing: FACING.down })).toBe(AIM.down)
    expect(aimOfPose({ facing: FACING.right, aim: 56 })).toBe(56)
  })

  it('writes an aim into a pose with its facing, and the aim only where it is not cardinal', () => {
    expect(aimFieldsOf(AIM.down)).toEqual({ facing: FACING.down })
    expect(aimFieldsOf(56)).toEqual({ facing: FACING.right, aim: 56 })
    expect(aimFieldsOf(44)).toEqual({ facing: FACING.down, aim: 44 })
  })
})
