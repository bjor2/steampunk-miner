import { describe, expect, it } from 'vitest'
import { dockSiteOf } from '../world/dockSite'
import { planetParamsFor } from '../world/planetParams'
import { returnQuanta } from './botEnergy'
import type { BotSession } from './botSession'
import { createBotSession } from './botSession'
import { createAuthorityState } from '../authority/authorityState'
import { galleryRowOfTile, galleryWaypointsOf, galleryWayOf, isPastHeldBand } from './galleryWays'
import {
  extendSide,
  galleryEndOf,
  galleryFaceOf,
  galleryRows,
  galleryTileAt,
  isCoreRow,
  newMineLayout,
  shaftColumnAt,
  type MineLayout,
} from './mineLayout'
import { zigzagClimbStepsOf, zigzagDipOf, zigzagTurnReachesBetween } from './zigzagGallery'
import { aimTowards } from './botPose'
import { bandOfTile } from '../world/planetGeometry'

// Ticket 899: the diagonal-heavy bot's ore galleries are zigzags of 45° legs as deep as the
// galleries are apart, each in step with the next; the default bot's stay level, tile for tile.

const SEED = 83921
const PARAMS = planetParamsFor(SEED, 1)
const LEG = 3

function layoutOf(digPolicy: 'cardinal' | 'diagonal_heavy'): MineLayout {
  return newMineLayout(PARAMS, dockSiteOf(PARAMS), digPolicy)
}

/** The shallowest ore gallery row. */
function firstOreRow(layout: MineLayout): number {
  return galleryRows(layout).find((row) => !isCoreRow(layout, row)) as number
}

function freshSession(): BotSession {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: SEED, playerIds: ['p1'] })
  return createBotSession(start, 'p1')
}

describe('zigzag gallery shape (ticket 899)', () => {
  it('dips down a leg and back up, a row a tile', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 9, 12].map((reach) => zigzagDipOf(reach, LEG))).toEqual([
      0, 1, 2, 3, 2, 1, 0, 1, 3, 0,
    ])
  })

  it('turns at each leg’s end on the way out and on the way back', () => {
    expect(zigzagTurnReachesBetween(0, 7, LEG)).toEqual([3, 6, 7])
    expect(zigzagTurnReachesBetween(7, 0, LEG)).toEqual([6, 3, 0])
    expect(zigzagTurnReachesBetween(0, 2, LEG)).toEqual([2])
  })

  it('climbs back along every leg that went down on the way out', () => {
    expect([0, 1, 3, 4, 6, 7, 10].map((reach) => zigzagClimbStepsOf(reach, LEG))).toEqual([
      0, 1, 3, 3, 3, 4, 6,
    ])
  })
})

describe('the mine’s galleries under each dig policy (ticket 899)', () => {
  it('keeps the default bot’s galleries level, along their rows', () => {
    const layout = layoutOf('cardinal')
    const row = firstOreRow(layout)
    expect(layout.zigzagLegTiles).toBeUndefined()
    extendSide(layout, row, 'east')
    expect(galleryEndOf(layout, row, 'east')).toEqual({
      tx: shaftColumnAt(layout, row) + 1,
      ty: row,
    })
    expect(galleryFaceOf(layout, row, 'west')).toEqual({
      tx: shaftColumnAt(layout, row) - 1,
      ty: row,
    })
  })

  it('steps every diagonal-heavy ore gallery tile 45° from the one before', () => {
    const layout = layoutOf('diagonal_heavy')
    const row = firstOreRow(layout)
    for (let reach = 1; reach <= 20; reach++) {
      const before = galleryTileAt(layout, row, 'east', reach - 1)
      const tile = galleryTileAt(layout, row, 'east', reach)
      expect(aimTowards(before, tile) % 16).toBe(8)
    }
  })

  it('keeps two untouched rows between a gallery and the next at every column', () => {
    const layout = layoutOf('diagonal_heavy')
    const [upper, lower] = galleryRows(layout).filter((row) => !isCoreRow(layout, row))
    for (let reach = 0; reach <= 20; reach++) {
      const above = galleryTileAt(layout, upper, 'west', reach)
      const below = galleryTileAt(layout, lower, 'west', reach)
      expect(above.ty - below.ty).toBe(3)
    }
  })

  it('keeps the core galleries level', () => {
    const layout = layoutOf('diagonal_heavy')
    const coreRow = galleryRows(layout).find((row) => isCoreRow(layout, row)) as number
    expect(galleryTileAt(layout, coreRow, 'east', 5).ty).toBe(coreRow)
  })

  it('finds the gallery a zigzag tile lies on, and walks back to the shaft at each turn', () => {
    const layout = layoutOf('diagonal_heavy')
    const row = galleryRows(layout).filter((candidate) => !isCoreRow(layout, candidate))[2]
    const tile = galleryTileAt(layout, row, 'east', 8)
    expect(galleryRowOfTile(layout, tile)).toBe(row)
    const way = galleryWayOf(layout, tile)
    expect(way).toMatchObject({ row, side: 'east', reach: 8 })
    expect(way.metres).toBeCloseTo(8 * Math.SQRT2)
    expect(way.climbMetres).toBeCloseTo(zigzagClimbStepsOf(8, LEG) * Math.SQRT2)
    expect(galleryWaypointsOf(layout, way, 8, 0)).toEqual(
      [6, 3, 0].map((reach) => galleryTileAt(layout, row, 'east', reach)),
    )
  })

  it('counts more energy home from a zigzag tile than from the level tile as far across', () => {
    const session = freshSession()
    const zigzag = layoutOf('diagonal_heavy')
    const level = layoutOf('cardinal')
    const row = firstOreRow(zigzag)
    const zigzagTile = galleryTileAt(zigzag, row, 'east', 4)
    const levelTile = galleryTileAt(level, row, 'east', 4)
    expect(returnQuanta(session, zigzag, zigzagTile)).toBeGreaterThan(
      returnQuanta(session, level, levelTile),
    )
  })

  it('ends a zigzag where it dips into a band the casing grade does not hold', () => {
    const layout = layoutOf('diagonal_heavy')
    const row = galleryRows(layout).find((candidate) => {
      const deepest = galleryTileAt(layout, candidate, 'east', LEG)
      return bandOfTile(PARAMS, deepest.tx, deepest.ty) === 2
    }) as number
    const dipped = galleryTileAt(layout, row, 'east', LEG)
    expect(isPastHeldBand(layout, row, dipped, 1)).toBe(true)
    expect(isPastHeldBand(layout, row, dipped, 2)).toBe(false)
    expect(isPastHeldBand(layoutOf('cardinal'), row, dipped, 1)).toBe(false)
  })
})
