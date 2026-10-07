import { describe, expect, it } from 'vitest'
import { COLLAPSE_BLOCK_SAMPLES } from '../../../constants/balance'
import { fuseTicksOf } from '../../economy/chargeSizes'
import { chargeCentreMm } from '../../vehicle/vehicleCharges'
import { blocksNear } from '../../world/collapseBlock'
import { chunksReadByBlock } from '../../world/collapseBlockGround'
import { MM_PER_SAMPLE } from '../../world/sampleGrid'
import { chunkKey, chunkOfTile } from '../../world/tileGrid'
import { createScriptedSession, PARAMS } from '../scriptedSession'
import { blastFrontOf } from './blastFront'
import { blastChunksOf, chunksAwaitingPrefetch } from './blastPrefetch'
import { plantOnWall, prepareBlaster } from './chargeFixtures'
import { R24_MM, SOLID_SITE } from './liveBlastFixtures'

const PLANT_TICK = 1

describe('blast prefetch', () => {
  it('generates a planted charge’s ground a chunk a tick, all of it before the fuse runs out', () => {
    const session = createScriptedSession()
    prepareBlaster(session, 0)
    plantOnWall(session, PLANT_TICK)
    const waiting = [chunksAwaitingPrefetch(session.state(), PARAMS).length]
    for (let tick = PLANT_TICK + 1; tick < PLANT_TICK + (fuseTicksOf(1) as number); tick++) {
      session.advanceTo(tick)
      waiting.push(chunksAwaitingPrefetch(session.state(), PARAMS).length)
    }
    expect(waiting[0]).toBeGreaterThan(0)
    expect(waiting.every((count, at) => at === 0 || count >= waiting[at - 1] - 1)).toBe(true)
    expect(waiting.at(-1)).toBe(0)
  })

  it('covers every chunk an R24 blast breaks and every chunk its rim checks read', () => {
    const covered = new Set(blastChunksOf(SOLID_SITE, R24_MM).map(({ cx, cy }) => chunkKey(cx, cy)))
    const broken = blastFrontOf(R24_MM).map(({ dx, dy }) =>
      chunkKey(chunkOfTile(SOLID_SITE.tx + dx), chunkOfTile(SOLID_SITE.ty + dy)),
    )
    const rimBlocks = blocksNear(
      chargeCentreMm(SOLID_SITE),
      R24_MM + COLLAPSE_BLOCK_SAMPLES * MM_PER_SAMPLE,
    )
    const read = rimBlocks.flatMap(chunksReadByBlock).map(({ cx, cy }) => chunkKey(cx, cy))
    expect([...broken, ...read].filter((key) => !covered.has(key))).toEqual([])
  })
})
