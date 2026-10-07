import { describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../../../constants/pacingSeeds'
import { oreMixFor } from '../../planet-mix'
import { gatedValueShareBpOf, gateTableOf, itemOfGate, type GatedEntry } from './gateTable'
import { GATE_ROWS } from './gateRows'

const SEEDS = PACING_WORLD_SEEDS['bot-slice']
const PLANETS = Array.from({ length: 200 }, (_, at) => at + 1)

/** Every band of every planet 1 to 200 on every pacing seed, with its gates. */
function everyBand(): { planet: number; seed: number; band: number; gated: GatedEntry[] }[] {
  return SEEDS.flatMap((seed) =>
    PLANETS.flatMap((planet) =>
      gateTableOf(oreMixFor(planet, seed)).bands.map((gated, at) => ({
        planet,
        seed,
        band: at + 1,
        gated: [...gated],
      })),
    ),
  )
}

const BANDS = everyBand()

function gateOf(planet: number, band: number, find: (gated: GatedEntry) => boolean) {
  return gateTableOf(oreMixFor(planet, SEEDS[0])).bands[band - 1].find(find)?.gate
}

describe('gate table', () => {
  it('gates nothing but drill-gated signatures before planet 7', () => {
    const early = BANDS.filter(({ planet }) => planet < GATE_ROWS.gateContentFromPlanet)
    const kinds = early.flatMap(({ gated }) =>
      gated.map(({ entry, gate }) => `${entry.signature ? 'signature' : 'lead'}:${gate.kind}`),
    )
    expect(new Set(kinds)).toEqual(new Set(['lead:none', 'signature:drillSignature']))
  })

  it('never gates a common cell beyond the drill rule', () => {
    const commons = BANDS.flatMap(({ gated }) =>
      gated.filter(({ entry }) => entry.lead === 0 && !entry.signature),
    )
    expect(commons.every(({ gate }) => gate.kind === 'none')).toBe(true)
  })

  it("seals planet 7's fossil leads for a size-1 charge, its showcase rare", () => {
    expect(gateOf(7, 5, ({ entry }) => entry.family === 'fossil' && entry.lead === 1)).toEqual({
      kind: 'dynamite',
      minCharge: 1,
    })
  })

  it("gives a signature from planet 7 the planet's newest extractor", () => {
    const gate = gateOf(7, 5, ({ entry }) => entry.signature)
    expect(gate?.kind === 'rig' && gate.rig.id).toBe('rig.resonance')
  })

  it('never lets a +2 entry need what a +1 entry of its band needs (same-item rule)', () => {
    const clashes = BANDS.filter(({ gated }) => {
      const itemsAt = (lead: number) =>
        gated
          .filter(({ entry }) => !entry.signature && entry.lead === lead)
          .map(({ gate }) => itemOfGate(gate))
          .filter((item) => item !== null)
      return itemsAt(2).some((item) => itemsAt(1).includes(item))
    })
    expect(clashes.map(({ planet, seed, band }) => `${seed} P${planet} b${band}`)).toEqual([])
  })

  it("holds every item to 15% of a band's ore value on planets 1 to 200 (the guard)", () => {
    const over = BANDS.flatMap(({ planet, seed, band, gated }) =>
      gated
        .map(({ gate }) => itemOfGate(gate))
        .filter((item) => item !== null)
        .filter((item) => gatedValueShareBpOf(gated, item) > GATE_ROWS.maxGatedValueShareBp)
        .map((item) => `${seed} P${planet} b${band} ${item}`),
    )
    expect(over).toEqual([])
  })
})
