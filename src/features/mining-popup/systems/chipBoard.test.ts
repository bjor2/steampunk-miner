import { describe, expect, it } from 'vitest'
import {
  addPickupToChips,
  chipPhaseAt,
  chipsShownAt,
  EMPTY_CHIP_BOARD,
  type ChipBoard,
  type OrePickup,
} from './chipBoard'
import type { SeenRarity } from '../../../systems/render/seenRarity'
import type { OreFace } from './oreFace'

const UP = { along: 0, upward: 1 }

function faceOf(oreId: string, speciesId: string | null = null): OreFace {
  const name = speciesId ?? oreId
  return {
    oreId,
    speciesId,
    name,
    family: 'metal',
    gradeName: 'Raw',
    iconId: 'none',
    swatch: 'red',
  }
}

function speciesPickup(oreId: string, speciesId: string, tick: number): OrePickup {
  return { ...pickup(oreId, tick), face: faceOf(oreId, speciesId) }
}

function pickup(oreId: string, tick: number, planetIndex = 1): OrePickup {
  return { face: faceOf(oreId), amount: 1, tick, planetIndex, away: UP, rarity: null }
}

function pickAll(pickups: readonly OrePickup[], board: ChipBoard = EMPTY_CHIP_BOARD): ChipBoard {
  return pickups.reduce(addPickupToChips, board)
}

const shownIds = (board: ChipBoard, tick: number) =>
  chipsShownAt(board, tick).map((chip) => `${chip.face.oreId}x${chip.count}`)

const RARE: SeenRarity = { lead: 2, rarity: 'rare', tint: [0, 0, 1], pulse: 0 }
const EPIC: SeenRarity = { lead: 3, rarity: 'epic', tint: [1, 0, 1], pulse: 0.3 }

describe('resource chips', () => {
  it('keeps the rarest seen rarity a chip has merged (ticket 454)', () => {
    const board = pickAll([
      { ...pickup('iron', 0), rarity: RARE },
      pickup('iron', 10),
      { ...pickup('iron', 20), rarity: EPIC },
      { ...pickup('iron', 30), rarity: RARE },
    ])
    expect(chipsShownAt(board, 30).map((chip) => chip.rarity)).toEqual([EPIC])
  })

  it('merges pickups of one type within 1.2 s into one chip that counts them', () => {
    const board = pickAll([pickup('iron', 0), pickup('iron', 72), pickup('iron', 144)])
    expect(shownIds(board, 144)).toEqual(['ironx3'])
  })

  it('starts a new chip for a pickup more than 1.2 s after the last one', () => {
    const board = pickAll([pickup('iron', 0), pickup('iron', 73)])
    expect(chipsShownAt(board, 73).map((chip) => chip.serial)).toEqual([1])
  })

  it('shows a lone chip for 1.4 s, fading over the last 0.4 s', () => {
    const board = pickAll([pickup('iron', 0)])
    const [chip] = chipsShownAt(board, 0)
    expect([chipPhaseAt(chip, 59), chipPhaseAt(chip, 60)]).toEqual(['rising', 'fading'])
    expect([shownIds(board, 83), shownIds(board, 84)]).toEqual([['ironx1'], []])
  })

  it('never keeps a merging chip up more than 3 s from its first pickup', () => {
    const steady = Array.from({ length: 6 }, (_, index) => pickup('iron', index * 30))
    const board = pickAll(steady)
    expect([shownIds(board, 179), shownIds(board, 180)]).toEqual([['ironx6'], []])
    const next = addPickupToChips(board, pickup('iron', 180))
    expect(chipsShownAt(next, 180).map((chip) => [chip.serial, chip.count])).toEqual([[1, 1]])
  })

  it('shows at most 3 chips, the oldest giving way to a new type', () => {
    const board = pickAll(['a', 'b', 'c', 'd'].map((oreId, index) => pickup(oreId, index)))
    expect(shownIds(board, 3)).toEqual(['bx1', 'cx1', 'dx1'])
  })

  it('never shows more than 3 chips through a minute of mixed fast mining', () => {
    const types = ['a', 'b', 'c', 'd', 'e']
    let board = EMPTY_CHIP_BOARD
    let most = 0
    for (let tick = 0; tick < 3600; tick += 7) {
      board = addPickupToChips(board, pickup(types[(tick * 13) % types.length], tick))
      most = Math.max(most, chipsShownAt(board, tick).length)
    }
    expect(most).toBe(3)
  })

  it('gives each shown chip its own slot away from the hull', () => {
    const board = pickAll([pickup('a', 0), pickup('b', 1), pickup('c', 2)])
    expect(chipsShownAt(board, 2).map((chip) => chip.slot)).toEqual([0, 1, 2])
    const later = addPickupToChips(board, pickup('d', 3))
    expect(chipsShownAt(later, 3).map((chip) => chip.slot)).toEqual([1, 2, 0])
  })

  it('names a type on its first 3 chips of a planet, then shows only icon and count', () => {
    let board = EMPTY_CHIP_BOARD
    const named: boolean[] = []
    for (const tick of [0, 200, 400, 600]) {
      board = addPickupToChips(board, pickup('iron', tick))
      named.push(chipsShownAt(board, tick)[0].isNamed)
    }
    expect(named).toEqual([true, true, true, false])
  })

  it('names a type again on a new planet', () => {
    const board = pickAll([0, 200, 400, 600].map((tick) => pickup('iron', tick)))
    const onPlanetTwo = addPickupToChips(board, pickup('iron', 800, 2))
    expect(chipsShownAt(onPlanetTwo, 800)[0].isNamed).toBe(true)
  })

  it('gives two species of one ore type a chip each, under their own names (ticket 695)', () => {
    const board = pickAll([
      speciesPickup('crystal_t1', 'clouded-quartzine', 0),
      speciesPickup('crystal_t1', 'flint-glass-quartzine', 10),
      speciesPickup('crystal_t1', 'clouded-quartzine', 20),
    ])
    const shown = chipsShownAt(board, 20).map((chip) => [chip.face.name, chip.count])
    expect(shown).toEqual([
      ['clouded-quartzine', 2],
      ['flint-glass-quartzine', 1],
    ])
  })

  it('merges one species mined at two tiers into one chip', () => {
    const board = pickAll([
      speciesPickup('metal_t1', 'ironstone-brassvein', 0),
      speciesPickup('metal_t2', 'ironstone-brassvein', 10),
    ])
    expect(shownIds(board, 10)).toEqual(['metal_t1x2'])
  })
})
