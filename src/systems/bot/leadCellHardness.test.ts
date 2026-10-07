import { describe, expect, it } from 'vitest'
import { hardnessOfTile } from '../authority/groundDrill'
import { surfaceOreTiles, WORLD_SEED } from '../authority/scriptedSession'
import { blockHardness, oreHardness, oreTier } from '../economy/oreEconomy'
import { startLevels, vehicleStatsAt } from '../economy/vehicleStats'
import { ticksPerTile } from '../vehicle/drillRule'
import { bandOfTile } from '../world/planetGeometry'
import { planetParamsFor } from '../world/planetParams'
import { GROUND_CELL, oreCell, RESOURCE_FAMILY } from '../world/worldCell'
import { boreTicks } from './botWorld'

const PLANET_3 = planetParamsFor(WORLD_SEED, 3)
const [BAND_1_TILE] = surfaceOreTiles(1, PLANET_3)
/** A band-1 ore cell two tiers above its band, as #140's +2 lead writes it. */
const LEAD_CELL = oreCell(RESOURCE_FAMILY.metal, 2)

describe('ore hardness by the cell (#140 Numbers "Hardness", #223)', () => {
  it("gives a lead cell the hardness of its own tier, not its band's", () => {
    expect(bandOfTile(PLANET_3, BAND_1_TILE.tx, BAND_1_TILE.ty)).toBe(1)
    expect(hardnessOfTile(PLANET_3, BAND_1_TILE, LEAD_CELL)).toEqual(oreHardness(oreTier(3, 3)))
    expect(hardnessOfTile(PLANET_3, BAND_1_TILE, LEAD_CELL)).not.toEqual(blockHardness(3, 1))
  })

  it("keeps plain ground at its band's hardness", () => {
    expect(hardnessOfTile(PLANET_3, BAND_1_TILE, GROUND_CELL)).toEqual(blockHardness(3, 1))
  })

  it('has the pacing bot bore a lead cell in the ticks the drill takes on it', () => {
    const drill = vehicleStatsAt({ ...startLevels(), drill_power: 12, drill_tip: 12 })
    const drillTicks = ticksPerTile(drill, hardnessOfTile(PLANET_3, BAND_1_TILE, LEAD_CELL))
    expect(drillTicks).not.toBeNull()
    expect(boreTicks(drill, PLANET_3, BAND_1_TILE, LEAD_CELL)).toBe(drillTicks)
    expect(drillTicks).not.toBe(ticksPerTile(drill, blockHardness(3, 1)))
  })
})
