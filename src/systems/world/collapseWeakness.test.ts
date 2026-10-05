import { describe, expect, it } from 'vitest'
import { casingRingAround, lineRing } from './casingLining'
import { blockContaining, blockIdOf, blockOfId, blocksNear, samplesOfBlock } from './collapseBlock'
import { weaknessOfBlock } from './collapseWeakness'
import { clearDisc } from './groundEdit'
import { planetParamsFor } from './planetParams'
import { MM_PER_SAMPLE } from './sampleGrid'
import { generatedChunkOf, EMPTY_WORLD, type WorldState } from './worldState'
import { chunkOfSample, localSampleOf, sampleIndexOf } from './sampleGrid'

const params = planetParamsFor(83921, 1)
/** Cave-free band-1 rock 16 m down, and band-2 rock 48 m down (band 2 starts 26 m down). */
const BAND_1_Y = 284500
const BAND_2_Y = 252500
const FROM_X = -30000
const TO_X = -14000

/** A level tunnel carved like the drill's stamp from `FROM_X` to `TO_X` at `y`. */
function carveTunnel(world: WorldState, y: number): WorldState {
  let carved = world
  for (let x = FROM_X; x <= TO_X; x += MM_PER_SAMPLE) {
    const disc = { xMm: x, yMm: y, radiusMm: 950, floorRadiusMm: null }
    carved = clearDisc(carved, params, disc, 255).world
  }
  return carved
}

/** Rings along the tunnel's axis every 0.5 m, as the vehicle lays them, at `grade`. */
function lineTunnel(world: WorldState, y: number, grade: number): WorldState {
  let lined = world
  for (let x = FROM_X; x <= TO_X; x += 500) {
    lined = lineRing(lined, params, casingRingAround(x, y), grade).world
  }
  return lined
}

const middleBlockAt = (y: number) => blockContaining({ xMm: (FROM_X + TO_X) / 2, yMm: y })

function isGeneratedSolid(block: ReturnType<typeof blockContaining>): boolean {
  return samplesOfBlock(block).every(({ sx, sy }) => {
    const { density } = generatedChunkOf(params, chunkOfSample(sx), chunkOfSample(sy))
    return density[sampleIndexOf(localSampleOf(sx), localSampleOf(sy))] === 255
  })
}

describe('collapse blocks', () => {
  it('names a block by its chunk and index and reads the name back', () => {
    const block = middleBlockAt(BAND_2_Y)
    expect(blockOfId(blockIdOf(block))).toEqual(block)
    expect(blockOfId('1,2#64')).toBeNull()
    expect(blockOfId('nonsense')).toBeNull()
  })

  it('lists the blocks within 16 m of a point in chunk key, then index order', () => {
    const near = blocksNear({ xMm: -22000, yMm: BAND_2_Y }, 16000)
    expect(near.length).toBeGreaterThan(40)
    expect(near.length).toBeLessThan(70)
    const ids = near.map(blockIdOf)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('collapse weakness', () => {
  it('starts from solid band-2 rock with no cave in the probe blocks', () => {
    expect(isGeneratedSolid(middleBlockAt(BAND_2_Y))).toBe(true)
    expect(isGeneratedSolid(middleBlockAt(BAND_1_Y))).toBe(true)
  })

  it('finds no weak block in untouched ground', () => {
    expect(weaknessOfBlock(EMPTY_WORLD, params, middleBlockAt(BAND_2_Y))).toBeNull()
  })

  it('never makes a band-1 tunnel lined at grade 1 weak', () => {
    const world = lineTunnel(carveTunnel(EMPTY_WORLD, BAND_1_Y), BAND_1_Y, 1)
    expect(weaknessOfBlock(world, params, middleBlockAt(BAND_1_Y))).toBeNull()
  })

  it('makes a band-2 tunnel lined at grade 1 weak, naming its band and grades', () => {
    const world = lineTunnel(carveTunnel(EMPTY_WORLD, BAND_2_Y), BAND_2_Y, 1)
    expect(weaknessOfBlock(world, params, middleBlockAt(BAND_2_Y))).toEqual({
      band: 2,
      weakestGrade: 1,
      required: 2,
    })
  })

  it('ignores unlined walls, so a band-2 tunnel never lined is not weak', () => {
    const world = carveTunnel(EMPTY_WORLD, BAND_2_Y)
    expect(weaknessOfBlock(world, params, middleBlockAt(BAND_2_Y))).toBeNull()
  })

  it('holds a band-2 tunnel lined at grade 2', () => {
    const world = lineTunnel(carveTunnel(EMPTY_WORLD, BAND_2_Y), BAND_2_Y, 2)
    expect(weaknessOfBlock(world, params, middleBlockAt(BAND_2_Y))).toBeNull()
  })

  it('stops being weak once the tunnel is relined at the grade its band needs', () => {
    const weak = lineTunnel(carveTunnel(EMPTY_WORLD, BAND_2_Y), BAND_2_Y, 1)
    expect(weaknessOfBlock(weak, params, middleBlockAt(BAND_2_Y))).not.toBeNull()
    const relined = lineTunnel(weak, BAND_2_Y, 2)
    expect(weaknessOfBlock(relined, params, middleBlockAt(BAND_2_Y))).toBeNull()
  })

  it('never makes a generated cave weak, even with grade-1 lining on its walls in band 2', () => {
    const caveBlock = blockContaining({ xMm: 26000, yMm: 260500 })
    expect(isGeneratedSolid(caveBlock)).toBe(false)
    let lined = EMPTY_WORLD
    let placed = 0
    for (const { sx, sy } of samplesOfBlock(caveBlock).filter((_, at) => at % 2 === 0)) {
      const ring = lineRing(
        lined,
        params,
        casingRingAround(sx * MM_PER_SAMPLE, sy * MM_PER_SAMPLE),
        1,
      )
      lined = ring.world
      placed += ring.placed
    }
    expect(placed).toBeGreaterThan(0)
    expect(weaknessOfBlock(lined, params, caveBlock)).toBeNull()
  })

  it('stops being weak once the drill cuts the weak lining away', () => {
    const weak = lineTunnel(carveTunnel(EMPTY_WORLD, BAND_2_Y), BAND_2_Y, 1)
    const block = middleBlockAt(BAND_2_Y)
    let widened = weak
    for (let x = FROM_X - 2000; x <= TO_X + 2000; x += MM_PER_SAMPLE) {
      const disc = { xMm: x, yMm: BAND_2_Y, radiusMm: 1750, floorRadiusMm: null }
      widened = clearDisc(widened, params, disc, 255).world
    }
    expect(weaknessOfBlock(widened, params, block)).toBeNull()
  })
})
