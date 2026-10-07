import { describe, expect, it } from 'vitest'
import { UP_VECTOR_SCALE } from '../../../constants/physics'
import { boreCellsFrom } from './boreWalk'
import { BORE_BEARING_COUNT, boreDirectionOf, clampedBearing, isBearingInArc } from './boreAim'
import BORE_BEARINGS from './boreBearings.json'

const UP = { x: 0, y: UP_VECTOR_SCALE }
const RIG_TILE = { tx: 10, ty: -40 }
const LEFT_EDGE = 85
const RIGHT_EDGE = 170

/** The table as it was generated once: pi * b / 255 round the lower half-plane, rounded. */
function generatedBearing(bearing: number): [number, number] {
  const angle = (Math.PI * bearing) / (BORE_BEARING_COUNT - 1)
  const along = Math.round(-Math.cos(angle) * BORE_BEARINGS.scale)
  const down = Math.round(Math.sin(angle) * BORE_BEARINGS.scale)
  return [along === 0 ? 0 : along, down === 0 ? 0 : down]
}

function boredCells(bearing: number) {
  return boreCellsFrom(RIG_TILE, boreDirectionOf(UP, clampedBearing(bearing)), 4)
}

describe('bore aim: the bearing table (ticket 313)', () => {
  it('pins 256 integer bearings to the lower half-plane as generated', () => {
    const expected = Array.from({ length: 256 }, (_, bearing) => generatedBearing(bearing))
    expect(BORE_BEARINGS.bearings).toEqual(expected)
  })

  it('runs from horizontal left through straight down to horizontal right', () => {
    expect(BORE_BEARINGS.bearings[0]).toEqual([-1024, 0])
    expect(BORE_BEARINGS.bearings[127]).toEqual([-6, 1024])
    expect(BORE_BEARINGS.bearings[128]).toEqual([6, 1024])
    expect(BORE_BEARINGS.bearings[255]).toEqual([1024, 0])
  })

  it('never points upward', () => {
    expect(BORE_BEARINGS.bearings.filter(([, down]) => down < 0)).toEqual([])
  })

  it('puts the arc edges at 60 degrees below horizontal on each side', () => {
    expect(BORE_BEARINGS.arcEdges).toEqual([LEFT_EDGE, RIGHT_EDGE])
    expect(BORE_BEARINGS.bearings[LEFT_EDGE]).toEqual([-512, 887])
    expect(BORE_BEARINGS.bearings[RIGHT_EDGE]).toEqual([512, 887])
  })
})

describe('bore aim: the arc clamp (ticket 313, #309 aim amendment)', () => {
  it('leaves every bearing from horizontal to the 60 degree edge as sent', () => {
    const inArc = Array.from({ length: 256 }, (_, bearing) => bearing).filter(isBearingInArc)
    expect(inArc).toHaveLength(172)
    expect(inArc.every((bearing) => clampedBearing(bearing) === bearing)).toBe(true)
  })

  it('clamps a bearing in the left half of the cone to the left 60 degree edge', () => {
    expect([86, 106, 127].map(clampedBearing)).toEqual([LEFT_EDGE, LEFT_EDGE, LEFT_EDGE])
  })

  it('clamps a bearing in the right half of the cone to the right 60 degree edge', () => {
    expect([128, 149, 169].map(clampedBearing)).toEqual([RIGHT_EDGE, RIGHT_EDGE, RIGHT_EDGE])
  })

  it('bores the cells of the 60 degree edge for straight down and 75 degrees below horizontal', () => {
    const leftEdge = boredCells(LEFT_EDGE)
    expect(boredCells(127)).toEqual(leftEdge)
    expect(boredCells(106)).toEqual(leftEdge)
    expect(boredCells(128)).toEqual(boredCells(RIGHT_EDGE))
  })
})

describe('bore aim: the world direction (ticket 313)', () => {
  it('turns a bearing into the rig frame, tangent right and up away from the core', () => {
    const squared = BORE_BEARINGS.scale * UP_VECTOR_SCALE
    expect(boreDirectionOf(UP, 0)).toEqual({ x: -squared, y: 0 })
    expect(boreDirectionOf(UP, 255)).toEqual({ x: squared, y: 0 })
    expect(boreDirectionOf({ x: UP_VECTOR_SCALE, y: 0 }, 0)).toEqual({ x: 0, y: squared })
  })

  it('points the edge bearings below the rig on a tilted frame', () => {
    const tilted = { x: 724, y: 724 }
    const left = boreDirectionOf(tilted, LEFT_EDGE)
    const right = boreDirectionOf(tilted, RIGHT_EDGE)
    expect(left.x * tilted.x + left.y * tilted.y).toBeLessThan(0)
    expect(right.x * tilted.x + right.y * tilted.y).toBeLessThan(0)
  })
})
