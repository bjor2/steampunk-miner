import { describe, expect, it } from 'vitest'
import { UPGRADE_IDS } from '../../systems/economy/economyDefinition'
import {
  blockHardness,
  coreHardness,
  oreHardness,
  oreSalePrice,
  oreTier,
  oreValue,
  signatureHardness,
  signatureSaleTier,
} from '../../systems/economy/oreEconomy'
import { paceScale } from '../../systems/economy/planetEconomy'
import { upgradePrice } from '../../systems/economy/upgradePrices'
import { toCanonical } from '../../systems/money'
import { BAND_COUNT } from '../../systems/world/planetGeometry'
import {
  bandStartsFor,
  coreRadiusFor,
  freshPlanetParamsFor,
  type PlanetParams,
} from '../../systems/world/planetParams'
import { surfaceLayerOf } from '../../systems/world/surfaceLayer'
import { ORE_ROWS } from './systems/oreRows'

// GD lock R1 on #302 (6306854642): radius changes only how long a planet takes, never hardness,
// ore value per cell, the drill law or prices. Change one planet's radius and every band's
// hardness, value and price stays byte-identical, the surface layer's rock by depth included.

const SEED = 20261021
const BANDS = Array.from({ length: BAND_COUNT }, (_, at) => at + 1)
const UPGRADE_LEVELS = [0, 1, 2, 5, 10]

/** A fresh planet's params at `radiusTiles`, its core and band starts following the radius. */
function paramsAtRadius(planetIndex: number, radiusTiles: number): PlanetParams {
  return {
    ...freshPlanetParamsFor(SEED, planetIndex),
    radiusTiles,
    coreRadiusTiles: coreRadiusFor(radiusTiles),
    bandStartsHalfTileSq: bandStartsFor(radiusTiles),
  }
}

/** Every band's rock and ore hardness, ore value and sale price, as canonical strings. */
function bandRowsOf(planetIndex: number) {
  return BANDS.map((band) => {
    const tier = oreTier(planetIndex, band)
    return [
      blockHardness(planetIndex, band),
      oreHardness(tier),
      oreValue(tier),
      oreSalePrice(tier),
      oreSalePrice(signatureSaleTier(tier)),
      signatureHardness(tier),
    ].map(toCanonical)
  })
}

/** What the planet charges for each upgrade track at a spread of levels. */
function upgradePricesOf(planetIndex: number): string[] {
  return UPGRADE_IDS.flatMap((id) =>
    UPGRADE_LEVELS.map((level) => toCanonical(upgradePrice(id, level, planetIndex))),
  )
}

/** The planet's hardness, value and price ledger as the generator's params read it. */
function ledgerOf(params: PlanetParams) {
  return {
    bands: bandRowsOf(params.planetIndex),
    surfaceRockByDepth: surfaceLayerOf(params)?.hardnessByDepth.map(toCanonical) ?? [],
    coreHardness: toCanonical(coreHardness(params.planetIndex)),
    paceScale: toCanonical(paceScale(params.planetIndex)),
    upgradePrices: upgradePricesOf(params.planetIndex),
  }
}

describe('planet radius', () => {
  it.each(ORE_ROWS.planets.rows.map((row) => [row.planetIndex, row.radiusTiles]))(
    'leaves planet %i hardness, value and price byte-identical when its radius %i changes',
    (planetIndex, radiusTiles) => {
      const shipped = ledgerOf(paramsAtRadius(planetIndex, radiusTiles))
      const changed = [300, radiusTiles + 1, 2 * radiusTiles].map((radius) =>
        ledgerOf(paramsAtRadius(planetIndex, radius)),
      )
      expect(changed).toEqual([shipped, shipped, shipped])
    },
  )

  it('keeps the pinned surface layer on the planets that have one, so the check reads it', () => {
    const layered = ORE_ROWS.planets.rows.filter(
      (row) => surfaceLayerOf(paramsAtRadius(row.planetIndex, row.radiusTiles)) !== null,
    )
    expect(layered.map((row) => row.planetIndex)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10])
  })
})
