import { describe, expect, it } from 'vitest'
import { BARE_BORE_CELLS_PER_METRE } from '../../../constants/balance'
import { boreWidthMmAt } from '../../../systems/vehicle/drillBore'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { describeItem } from '../../../systems/registries/itemDescriber'
import { itemSnapshotViewOf } from '../../../systems/registries/itemSnapshotView'
import { REACH_BOOM_ID, SIDE_CUTTERS_ID } from './cuttersAndBoom'
import { DEEP_BRANCH, DRILL_GEAR_FORK, WIDE_BRANCH } from './drillGearFork'
import { SIDE_CUTTERS_MARK_2_ID } from './sideCutterMarks'
import { TWIN_BIT_ID } from './twinBit'

// The width cards' copy (GD lock on #308, ticket 621), on the kernel's one bore width since ticket
// 749: a width level grows the body a metre, so the side cutters (level 1) read a 2.2 m bore, their
// Mark 2 3.2 m and Wide 4.2 m with Mark 2 owned; each shows the ore a level adds (one width cell a
// metre at 600 bp, over the bare 1.2 m bore's 1 cell a metre, #316's b since ticket 663) and no card
// claims speed.

const WIDER_NOT_FASTER =
  'Note: a wider bore, not a faster one: each side cell costs its full energy and heat'
const SIDEGRADE = 'Note: a one-off sidegrade: no level track, and drill speed is unchanged'
const SPEED_CLAIM = /faster(?! one)|speed (up|gain|boost)|quicker|\+\d+% (speed|pace)/i

function cardLinesOf(itemId: string, level = 0): string[] {
  const state = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] })
  const ctx = { playerId: 'p1', planetIndex: 1, level, view: itemSnapshotViewOf(state, 'p1') }
  const card = describeItem({ kind: 'vehicle-item', id: itemId }, ctx)
  return (card?.statLines ?? []).map((line) => `${line.label}: ${line.now}`)
}

function branchNotesOf(branch: string): string[] {
  const node = DRILL_GEAR_FORK.branches.find((candidate) => candidate.branch === branch)
  return (node?.cardNotes ?? []).map((note) => `Note: ${note}`)
}

describe('drill-gear: the width cards (ticket 621)', () => {
  it("reads the bare bore off the bore row: the 0.9 m body and 0.15 m a side, #316's b of 1", () => {
    expect(boreWidthMmAt(0)).toBe(1200)
    expect(BARE_BORE_CELLS_PER_METRE).toBe(1)
  })

  it('reads the side cutters as a 2.2 m bore taking 6% more ore a metre', () => {
    const lines = cardLinesOf(SIDE_CUTTERS_ID)
    expect(lines).toContain('Bore width (m): 2.2')
    expect(lines).toContain('Ore a metre (+%): 6')
    expect(lines).toContain(WIDER_NOT_FASTER)
  })

  it('reads the double side cutters as a 3.2 m bore taking 12% more ore a metre', () => {
    expect(cardLinesOf(SIDE_CUTTERS_MARK_2_ID).slice(0, 4)).toEqual([
      'Side cells (cells): 2',
      'Bore width (m): 3.2',
      'Ore a metre (+%): 12',
      WIDER_NOT_FASTER,
    ])
  })

  it('keeps the bore width the same at every research Mark of the cutters', () => {
    expect(cardLinesOf(SIDE_CUTTERS_ID, 5)).toContain('Bore width (m): 2.2')
  })

  it('gives Wide 2.2 m on its reamers alone and 4.2 m with the widest Mark owned, +18% ore', () => {
    expect(branchNotesOf(WIDE_BRANCH)).toEqual([
      'Note: bore width 2.2 m, 4.2 m with the widest flank cutters owned',
      'Note: side cells pay 6% of their ore: up to +18% ore a metre',
      SIDEGRADE,
    ])
  })

  it('labels every drill type a one-off sidegrade with no level track', () => {
    expect(branchNotesOf(DEEP_BRANCH)).toContain(SIDEGRADE)
    expect(cardLinesOf(TWIN_BIT_ID)).toContain(SIDEGRADE)
    expect(cardLinesOf(REACH_BOOM_ID)).toContain(SIDEGRADE)
  })

  it('never claims a speed gain on a width or drill-type card', () => {
    const copy = [
      ...cardLinesOf(SIDE_CUTTERS_ID),
      ...cardLinesOf(SIDE_CUTTERS_MARK_2_ID),
      ...cardLinesOf(TWIN_BIT_ID),
      ...cardLinesOf(REACH_BOOM_ID),
      ...branchNotesOf(WIDE_BRANCH),
      ...branchNotesOf(DEEP_BRANCH),
    ]
    expect(copy.filter((line) => SPEED_CLAIM.test(line))).toEqual([])
  })
})
