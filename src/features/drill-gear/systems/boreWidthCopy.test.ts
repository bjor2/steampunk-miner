import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { describeItem } from '../../../systems/registries/itemDescriber'
import { itemSnapshotViewOf } from '../../../systems/registries/itemSnapshotView'
import { REACH_BOOM_ID, SIDE_CUTTERS_ID } from './cuttersAndBoom'
import {
  DEEP_BRANCH,
  DRILL_GEAR_FORK,
  forkValueOf,
  GALLERY_REAMERS_ID,
  WIDE_BRANCH,
} from './drillGearFork'
import { gearValueOf } from './drillGearItems'
import { SIDE_CUTTERS_MARK_2_ID, sideCellsOfMark, sideCutterMarkOf } from './sideCutterMarks'
import { TWIN_BIT_ID } from './twinBit'

// The width cards' copy (GD lock on #308, ticket 621): the bore is 2 + s cells a metre, a cell a
// metre wide, so the side cutters read 3 m, their Mark 2 4 m and Wide 5 m with Mark 2 on; each
// shows the ore a side cell adds (600 bp a side cell, over the bore's 2) and no card claims speed.

const BARE_BORE_CELLS = 2
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

const MARK_2_CELLS = sideCellsOfMark(sideCutterMarkOf(SIDE_CUTTERS_MARK_2_ID)!)
const WIDE_CELLS = forkValueOf(GALLERY_REAMERS_ID, 'sideCells') + MARK_2_CELLS

describe('drill-gear: the width cards (ticket 621)', () => {
  it('reads the side cutters as a 3 m bore taking 3% more ore a metre', () => {
    expect(BARE_BORE_CELLS + gearValueOf(SIDE_CUTTERS_ID, 'sideCells')).toBe(3)
    const lines = cardLinesOf(SIDE_CUTTERS_ID)
    expect(lines).toContain('Bore width (m): 3')
    expect(lines).toContain('Ore a metre (+%): 3')
    expect(lines).toContain(WIDER_NOT_FASTER)
  })

  it('reads the double side cutters as a 4 m bore taking 6% more ore a metre', () => {
    expect(BARE_BORE_CELLS + MARK_2_CELLS).toBe(4)
    expect(cardLinesOf(SIDE_CUTTERS_MARK_2_ID).slice(0, 4)).toEqual([
      'Side cells (cells): 2',
      'Bore width (m): 4',
      'Ore a metre (+%): 6',
      WIDER_NOT_FASTER,
    ])
  })

  it('keeps the bore width the same at every research Mark of the cutters', () => {
    expect(cardLinesOf(SIDE_CUTTERS_ID, 5)).toContain('Bore width (m): 3')
  })

  it('gives Wide 3 m on its reamers alone and 5 m with the widest cutters on, +9% ore', () => {
    expect(BARE_BORE_CELLS + WIDE_CELLS).toBe(5)
    expect(branchNotesOf(WIDE_BRANCH)).toEqual([
      'Note: bore width 3 m, 5 m with the widest flank cutters on',
      'Note: side cells pay 6% of their ore: up to +9% ore a metre',
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
