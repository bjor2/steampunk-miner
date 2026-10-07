import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { chargeRadiusMm } from '../../economy/chargeSizes'
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
  it("tells a registered effect the charge's blast as size 1, every field an integer", () => {
    const seen: BlastEvent[] = []
    blastWith([recordingSliceOf(seen)])
    expect(seen).toEqual([
      {
        ...WALL_TILE,
        radiusMm: chargeRadiusMm(1),
        size: 1,
        playerId: 'p1',
        source: 'charge',
        tick: BLAST_TICK,
      },
    ])
  })

  it("puts a registered effect's events after ChargeDetonated's and before the ground's", () => {
    const { blast } = blastWith([recordingSliceOf([])])
    const types = typesOf(blast)
    const marker = types.indexOf('StorageFull')
    expect(marker).toBeGreaterThan(types.indexOf('ChargeDetonated'))
    expect(marker).toBeLessThan(types.indexOf('BlastFront'))
    expect(blast[marker]).toMatchObject({ tick: BLAST_TICK, playerId: 'p1', lostUnits: 7 })
  })

  it("keeps today's blast events and state when an effect only adds an event", () => {
    const plain = blastWith([])
    const withMarker = blastWith([recordingSliceOf([])])
    const isMarker = (event: { type: string }) => event.type === 'StorageFull'
    expect(withMarker.blast.filter((event) => !isMarker(event))).toEqual(plain.blast)
    expect(withMarker.digest).toBe(plain.digest)
  })
})
