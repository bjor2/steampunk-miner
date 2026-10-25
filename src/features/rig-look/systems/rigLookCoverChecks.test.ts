import { describe, expect, it } from 'vitest'
import { UPGRADE_IDS } from '../../../systems/economy/economyDefinition'
import { bandEvery, FIXTURE_FINISHES } from './render/rigLookFixtures'
import type { TrackLookRows } from './render/rigLookIndex'
import { RIG_LOOK_TABLE } from './rigLookTable'
import { rigLookTableProblemsOf, type RigLookTable } from './rigLookTableChecks'

/** The drill-type tracks #623 adds, each keyed by its gear id (GD lock on #623). */
const TYPE_TRACKS = ['gear.twin_bit', 'gear.side_cutters', 'gear.reach_boom']

/** A drill-type look on the head, standing for `covers`' art. */
function typeTrackOf(track: string, covers: readonly string[], slot = 'drill.head'): TrackLookRows {
  return {
    track,
    slot,
    covers,
    glowSlots: [['drill-bit']],
    glowCap: 'drillNose',
    steps: [{ from: 5, part: null, card: null, colour: '#c08040', glows: [0] }],
    band: bandEvery(5, 1),
  }
}

function problemsOf(...tracks: TrackLookRows[]): string[] {
  const table: RigLookTable = {
    glowCaps: { drillNose: 3 },
    lookAssets: {},
    finishes: FIXTURE_FINISHES,
    glint: { ticks: 24, colour: '#fff2c8', glow: 0.25 },
    tracks,
  }
  return rigLookTableProblemsOf(table, [...UPGRADE_IDS, ...TYPE_TRACKS])
}

describe('rig look covers', () => {
  it('covers nothing on any shipped track, so every swap stays the one before ticket 892', () => {
    expect(RIG_LOOK_TABLE.tracks.filter((rows) => rows.covers !== undefined)).toEqual([])
  })

  it('loads a track that covers its own item, and one that covers another track’s item', () => {
    expect(problemsOf(typeTrackOf('gear.twin_bit', ['gear.twin_bit']))).toEqual([])
    expect(
      problemsOf(
        typeTrackOf('gear.twin_bit', ['gear.twin_bit', 'gear.side_cutters']),
        typeTrackOf('gear.side_cutters', ['gear.side_cutters'], 'drill.flank'),
      ),
    ).toEqual([])
  })

  it('refuses a covered id that is not an item id', () => {
    expect(problemsOf(typeTrackOf('gear.twin_bit', ['twin_bit', 'drill_tip']))).toEqual([
      'gear.twin_bit: covers twin_bit, which is not an item id',
      'gear.twin_bit: covers drill_tip, which is not an item id',
    ])
  })

  it('refuses an item covered twice by one track', () => {
    expect(problemsOf(typeTrackOf('gear.twin_bit', ['gear.twin_bit', 'gear.twin_bit']))).toEqual([
      'gear.twin_bit: covers an item twice',
    ])
  })

  it('refuses tracks that cover each other round a loop, naming each track on it', () => {
    expect(
      problemsOf(
        typeTrackOf('gear.twin_bit', ['gear.side_cutters']),
        typeTrackOf('gear.side_cutters', ['gear.reach_boom'], 'drill.flank'),
        typeTrackOf('gear.reach_boom', ['gear.twin_bit'], 'drill.collar'),
      ),
    ).toEqual([
      'gear.twin_bit: covers loop back to it through another track',
      'gear.side_cutters: covers loop back to it through another track',
      'gear.reach_boom: covers loop back to it through another track',
    ])
  })

  it('leaves a track off the loop it only leads into', () => {
    expect(
      problemsOf(
        typeTrackOf('gear.reach_boom', ['gear.twin_bit'], 'drill.collar'),
        typeTrackOf('gear.twin_bit', ['gear.side_cutters']),
        typeTrackOf('gear.side_cutters', ['gear.twin_bit'], 'drill.flank'),
      ),
    ).toEqual([
      'gear.twin_bit: covers loop back to it through another track',
      'gear.side_cutters: covers loop back to it through another track',
    ])
  })
})
