import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { describeItem } from '../../../systems/registries/itemDescriber'
import { itemSnapshotViewOf } from '../../../systems/registries/itemSnapshotView'
import { REACH_BOOM_ID } from './cuttersAndBoom'
import { DEEP_BRANCH, DRILL_GEAR_FORK, WIDE_BRANCH } from './drillGearFork'

// Content on #392: the plunge crown (Deep) and the reach boom share one cut ahead of the bit, the
// larger ask wins, so each card says it doesn't stack with the other, with the "Note" label (#351).

const CROWN_LINE = "Note: doesn't stack with the reach boom; the longer cut ahead wins"
const BOOM_LINE = "Note: doesn't stack with the plunge crown; the longer cut ahead wins"

function boomCardLines(level: number): string[] {
  const state = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] })
  const ctx = { playerId: 'p1', planetIndex: 1, level, view: itemSnapshotViewOf(state, 'p1') }
  const card = describeItem({ kind: 'vehicle-item', id: REACH_BOOM_ID }, ctx)
  return (card?.statLines ?? []).map((line) => `${line.label}: ${line.now}`)
}

function branchNotesOf(branch: string): readonly string[] {
  const node = DRILL_GEAR_FORK.branches.find((candidate) => candidate.branch === branch)
  return (node?.cardNotes ?? []).map((note) => `Note: ${note}`)
}

describe('drill-gear: the ahead-cut notes (Content on #392)', () => {
  it("renders the reach boom's note on its card, the same at every Mark", () => {
    expect(boomCardLines(0)).toContain(BOOM_LINE)
    expect(boomCardLines(5)).toContain(BOOM_LINE)
  })

  it("gives the plunge crown's branch its note, and Wide none", () => {
    expect(branchNotesOf(DEEP_BRANCH)).toEqual([CROWN_LINE])
    expect(branchNotesOf(WIDE_BRANCH)).toEqual([])
  })
})
