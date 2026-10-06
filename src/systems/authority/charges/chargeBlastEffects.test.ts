import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { blastRadiusMm } from '../../economy/blastingCharges'
import type { BlastEvent } from '../../registries/blastEffects'
import { FACING } from '../../vehicle/vehiclePose'
import { stateDigest } from '../stateDigest'
import { createScriptedSession, typesOf } from '../scriptedSession'
import {
  BACKED_OFF_TILE,
  plantOnWall,
  poseOnTile,
  prepareBlaster,
  WALL_TILE,
} from './chargeFixtures'

// A charge's blast runs the slices' blast effects last (feature-slices.md 3.7); a fake slice
// registers one through withRegistrations, so no real slice is imported.

const FUSE_TICKS = 120
const BLAST_TICK = 1 + FUSE_TICKS

/** Plants at tick 1, backs off, and runs the clock past the fuse with only `slices` registered. */
function blastWith(slices: readonly SliceDefinition[]) {
  return withRegistrations(slices, () => {
    const session = createScriptedSession()
    prepareBlaster(session, 0)
    plantOnWall(session, 1)
    session.submit(2, poseOnTile(BACKED_OFF_TILE, FACING.right))
    const blast = session.advanceTo(BLAST_TICK)
    return { blast, digest: stateDigest(session.state()) }
  })
}

function recordingSliceOf(seen: BlastEvent[]): SliceDefinition {
  return {
    id: 'blast-probe',
    register: (r) =>
      r.blastEffect({
        id: 'blast-probe.marker',
        apply: (state, blast) => {
          seen.push(blast)
          return { state, events: [{ type: 'StorageFull', lostUnits: 7 }] }
        },
      }),
  }
}

describe('charge blast effects', () => {
  it("tells a registered effect the charge's blast, every field an integer", () => {
    const seen: BlastEvent[] = []
    blastWith([recordingSliceOf(seen)])
    expect(seen).toEqual([
      {
        ...WALL_TILE,
        radiusMm: blastRadiusMm(),
        playerId: 'p1',
        source: 'charge',
        tick: BLAST_TICK,
      },
    ])
  })

  it("puts a registered effect's events after ChargeDetonated's, stamped for the planter", () => {
    const { blast } = blastWith([recordingSliceOf([])])
    const types = typesOf(blast)
    expect(types.at(-1)).toBe('StorageFull')
    expect(types.indexOf('StorageFull')).toBeGreaterThan(types.indexOf('ChargeDetonated'))
    expect(blast.at(-1)).toMatchObject({ tick: BLAST_TICK, playerId: 'p1', lostUnits: 7 })
  })

  it("keeps today's blast events and state when an effect only adds an event", () => {
    const plain = blastWith([])
    const withMarker = blastWith([recordingSliceOf([])])
    expect(withMarker.blast.slice(0, -1)).toEqual(plain.blast)
    expect(withMarker.digest).toBe(plain.digest)
  })
})
