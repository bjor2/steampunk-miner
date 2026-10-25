import { describe, expect, it } from 'vitest'
import { baseTilesSqOf } from './blastDisc'
import {
  blastFrontOf,
  frontDistanceSqAt,
  frontRadiusMm,
  frontWalkFrom,
  inRadiusCount,
  parkFrontWalk,
  ticksToClear,
  type FrontTile,
} from './blastFront'

/** A whole-tile radius as the squared tile reach the front is keyed on. */
const reachOf = (radiusTiles: number) => radiusTiles * radiusTiles

/** Every tile offset within `radiusTiles` of the charge tile's centre, counted the plain way. */
function plainCount(radiusTiles: number): number {
  let count = 0
  for (let dy = -radiusTiles; dy <= radiusTiles; dy++) {
    for (let dx = -radiusTiles; dx <= radiusTiles; dx++) {
      if (dx * dx + dy * dy <= radiusTiles * radiusTiles) count++
    }
  }
  return count
}

/** The front as K6 built it whole: every tile in the disc, sorted nearest first, row order kept. */
function sortedFront(tilesSq: number): FrontTile[] {
  const reach = Math.floor(Math.sqrt(tilesSq))
  const tiles: FrontTile[] = []
  for (let dy = 0 - reach; dy <= reach; dy++) {
    for (let dx = 0 - reach; dx <= reach; dx++) {
      const distanceSq = dx * dx + dy * dy
      if (distanceSq <= tilesSq) tiles.push({ dx, dy, distanceSq })
    }
  }
  return tiles.sort((a, b) => a.distanceSq - b.distanceSq)
}

function walkedTiles(tilesSq: number, cursor: number, count: number): FrontTile[] {
  const walk = frontWalkFrom(tilesSq, cursor)
  const tiles: FrontTile[] = []
  for (let tile = walk.next(); tile !== null && tiles.length < count; tile = walk.next()) {
    tiles.push(tile)
  }
  return tiles
}

describe('blast front', () => {
  it('counts 1,793 tiles in a 24-tile radius and 21 in the shipped 2.5-tile one', () => {
    expect(inRadiusCount(reachOf(24))).toBe(1793)
    expect(inRadiusCount(baseTilesSqOf(2500))).toBe(21)
  })

  it('holds every tile within the radius once, as the plain count does, for radii 4 to 24', () => {
    for (let radius = 4; radius <= 24; radius++) {
      const front = blastFrontOf(reachOf(radius))
      const keys = new Set(front.map(({ dx, dy }) => `${dx},${dy}`))
      expect(front).toHaveLength(plainCount(radius))
      expect(keys.size).toBe(front.length)
    }
  })

  it('takes the nearest tiles first, ties in row order', () => {
    const front = blastFrontOf(reachOf(24))
    expect(front[0]).toEqual({ dx: 0, dy: 0, distanceSq: 0 })
    expect(front.slice(1, 5).map(({ dx, dy }) => [dx, dy])).toEqual([
      [0, -1],
      [-1, 0],
      [1, 0],
      [0, 1],
    ])
    const isNearestFirst = front.every(
      (tile, at) => at === 0 || front[at - 1].distanceSq <= tile.distanceSq,
    )
    expect(isNearestFirst).toBe(true)
  })

  it('clears an R24 blast in 29 ticks of 64 tiles', () => {
    expect(ticksToClear(reachOf(24))).toBe(29)
    for (let radius = 4; radius <= 24; radius++) {
      expect(ticksToClear(reachOf(radius))).toBe(Math.ceil(plainCount(radius) / 64))
    }
  })

  it('walks the same tiles in the same order as the whole sorted front, for reaches 0 to 1,400', () => {
    for (const tilesSq of [0, 1, 2, 6, 12, 20, 576, 1369, 1400]) {
      expect(blastFrontOf(tilesSq)).toEqual(sortedFront(tilesSq))
      expect(inRadiusCount(tilesSq)).toBe(sortedFront(tilesSq).length)
    }
  })

  it('starts a walk at any cursor on the tiles the whole front holds from there', () => {
    const whole = sortedFront(1369)
    for (const cursor of [0, 1, 5, 64, 777, 2000, whole.length - 1, whole.length]) {
      expect(walkedTiles(1369, cursor, 64)).toEqual(whole.slice(cursor, cursor + 64))
    }
  })

  it('goes on from a parked walk exactly where it stopped', () => {
    const walk = frontWalkFrom(576, 100)
    for (let taken = 0; taken < 30; taken++) walk.next()
    parkFrontWalk(walk)
    expect(walkedTiles(576, 130, 40)).toEqual(sortedFront(576).slice(130, 170))
  })

  it('names the squared distance of any front tile without walking to it', () => {
    const whole = sortedFront(1369)
    for (const index of [0, 1, 4, 5, 100, 4292]) {
      expect(frontDistanceSqAt(1369, index)).toBe(whole[index].distanceSq)
    }
  })

  it("counts a disc spanning planet 1's diameter without building it, and walks its last tiles", () => {
    expect(inRadiusCount(reachOf(37))).toBe(4293)
    const tiles = plainCount(600)
    expect(inRadiusCount(reachOf(600))).toBe(tiles)
    expect(walkedTiles(reachOf(600), tiles - 73, 100)).toHaveLength(73)
  })

  it('measures the front from the charge tile centre in whole millimetres', () => {
    expect(frontRadiusMm(0)).toBe(0)
    expect(frontRadiusMm(1)).toBe(1000)
    expect(frontRadiusMm(2)).toBe(1414)
    expect(frontRadiusMm(576)).toBe(24000)
  })
})
