import { describe, expect, it } from 'vitest'
import { fromCanonical } from '../../../systems/money'
import economyFile from '../sensing.economy.json'
import { SENSING_ECONOMY, readSensingEconomy } from './sensingEconomy'

describe('sensing economy', () => {
  it('reads 15 band-5 ore one-off and 2 band-5 ore per consumable unit (#162 4.1)', () => {
    expect(SENSING_ECONOMY.price).toEqual({ band: 5, oreUnits: fromCanonical('15') })
    expect(SENSING_ECONOMY.unitPrice).toEqual({ band: 5, oreUnits: fromCanonical('2') })
  })

  it('reads the echo sounder, galvanic probe and void sounder rows of #162 4.2', () => {
    expect(SENSING_ECONOMY.charged).toEqual({
      'power.echo_sounder': {
        charges: 3,
        cooldownTicks: 300,
        windupTicks: 6,
        radiusTiles: 12,
        revealTicks: 600,
      },
      'power.galvanic_probe': {
        charges: 3,
        cooldownTicks: 300,
        windupTicks: 6,
        radiusTiles: 12,
        revealTicks: 600,
      },
      'power.void_sounder': {
        charges: 2,
        cooldownTicks: 600,
        windupTicks: 6,
        radiusTiles: null,
        revealTicks: 900,
      },
    })
  })

  it('reads the flare mortar and signal buoy rows of #162 4.3', () => {
    expect(SENSING_ECONOMY.consumable).toEqual({
      'consumable.flare_mortar': { stack: 3, windupTicks: 6, rangeTiles: 30, radiusTiles: 6 },
      'consumable.signal_buoy': { stack: 3, windupTicks: 6, rangeTiles: null, radiusTiles: 4 },
    })
  })

  it("reads the passives' base magnitudes of #162 4.4: periscope 10 and lens 6 tiles, barometer 5 cells (amended 7 Oct)", () => {
    expect(SENSING_ECONOMY.passive).toEqual({
      'passive.threat_periscope': { reach: 'radius', magnitude: 10 },
      'passive.assay_lens': { reach: 'radius', magnitude: 6 },
      'passive.hazard_barometer': { reach: 'lookahead', magnitude: 5 },
    })
  })

  it('refuses the whole file and lists every broken field', () => {
    const broken: { items: Record<string, Record<string, unknown>> } = structuredClone(economyFile)
    broken.items.unitPrice = { band: 5, oreUnits: -2 }
    broken.items.charged = {
      'power.void_sounder': {
        ...economyFile.items.charged['power.void_sounder'],
        radiusTiles: 'all',
      },
    }
    broken.items.consumable = {
      'consumable.signal_buoy': { stack: 3, windupTicks: 6 },
    }
    broken.items.passive = {
      'passive.assay_lens': { radiusTiles: 6, lookaheadCells: 4 },
    }
    expect(readSensingEconomy(broken)).toEqual({
      problems: [
        'items.unitPrice.oreUnits must be a decimal string >= 0',
        'items.charged.power.void_sounder.radiusTiles must be a safe integer',
        'items.consumable.consumable.signal_buoy.radiusTiles must be a safe integer',
        'items.passive.passive.assay_lens must name exactly one of radiusTiles and lookaheadCells',
      ],
    })
  })
})
