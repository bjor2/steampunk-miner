import { describe, expect, it } from 'vitest'
import { DRILL_GEAR_ITEMS, SHIPPED_DRILL_GEAR } from './drillGearItems'
import { statPreview, type DrillGearStatPreview } from './statPreview'

const PLANET = 24

function valuesOf(preview: DrillGearStatPreview | null): Record<string, number> {
  return Object.fromEntries((preview?.lines ?? []).map((line) => [line.stat, line.value]))
}

/** The first Mark that masters the item. */
function masteringMarkOf(itemId: string): number {
  let mark = 1
  while (!statPreview(itemId, mark, PLANET)!.isMastered) mark++
  return mark
}

describe('drill-gear stat preview', () => {
  it('shows the corer as bought: 4 charges, 300 cooldown, a 6-tick wind-up, reach 6 (#162 4.2)', () => {
    expect(valuesOf(statPreview('gear.sampling_corer', 1, PLANET))).toEqual({
      charges: 4,
      cooldownTicks: 300,
      windUpTicks: 6,
      reachTiles: 6,
    })
  })

  it('steps the corer cooldown, then reach, then charges from Mark 2 (the #165 rotation)', () => {
    const marks = [2, 3, 4].map((mark) => statPreview('gear.sampling_corer', mark, PLANET)!)
    expect(marks.map((preview) => preview.stepped)).toEqual(['cooldown', 'magnitude', 'charges'])
    expect(marks.map(valuesOf)).toEqual([
      { charges: 4, cooldownTicks: 276, windUpTicks: 6, reachTiles: 6 },
      { charges: 4, cooldownTicks: 276, windUpTicks: 6, reachTiles: 7 },
      { charges: 5, cooldownTicks: 276, windUpTicks: 6, reachTiles: 7 },
    ])
  })

  it('masters the corer at 0.5x cooldown, 2x reach and +3 charges, then steps nothing', () => {
    const last = masteringMarkOf('gear.sampling_corer')
    expect(valuesOf(statPreview('gear.sampling_corer', last, PLANET))).toEqual({
      charges: 7,
      cooldownTicks: 150,
      windUpTicks: 6,
      reachTiles: 12,
    })
    expect(statPreview('gear.sampling_corer', last + 1, PLANET)!.stepped).toBeNull()
  })

  it('steps a toggle draw down to half: the auger from 30 to 15 bp of energy per second', () => {
    const auger = (mark: number) => valuesOf(statPreview('gear.spoil_auger', mark, PLANET))
    expect(statPreview('gear.spoil_auger', 2, PLANET)!.stepped).toBe('cooldown')
    expect(auger(1).drawBpPerSecond).toBe(30)
    expect(auger(2).drawBpPerSecond).toBe(28)
    expect(auger(masteringMarkOf('gear.spoil_auger')).drawBpPerSecond).toBe(15)
  })

  it('widens the side cutters to two cells but never cheapens a side cell', () => {
    const last = masteringMarkOf('gear.side_cutters')
    expect(valuesOf(statPreview('gear.side_cutters', last, PLANET))).toEqual({
      sideCells: 2,
      sideEnergyShareBp: 10000,
    })
  })

  it('grows the vibratory bit reach and keeps its crumble rule at half the drill power', () => {
    const last = masteringMarkOf('gear.vibratory_bit')
    expect(valuesOf(statPreview('gear.vibratory_bit', 1, PLANET))).toEqual({
      crumbleAheadCells: 1,
      crumbleHardnessBp: 5000,
    })
    expect(valuesOf(statPreview('gear.vibratory_bit', last, PLANET)).crumbleAheadCells).toBe(2)
  })

  it('masters on purchase the gear with nothing to step: the thaw crown and the boom', () => {
    const atPurchase = SHIPPED_DRILL_GEAR.filter((item) => masteringMarkOf(item.itemId) === 1)
    expect(atPurchase.map((item) => item.itemId)).toEqual(['gear.thaw_crown', 'gear.reach_boom'])
    expect(valuesOf(statPreview('gear.reach_boom', 1, PLANET))).toEqual({
      aheadCells: 1,
      drawBpPerSecond: 0,
    })
  })

  it('previews nothing for the held-back twin-bit head and dielectric bit', () => {
    const unseen = DRILL_GEAR_ITEMS.filter((item) => statPreview(item.itemId, 1, PLANET) === null)
    expect(unseen.map((item) => item.itemId)).toEqual(['gear.twin_bit', 'gear.dielectric_bit'])
  })

  it('reads the same on every planet: a one-off item never rescales', () => {
    expect(statPreview('gear.sampling_corer', 4, 40)).toEqual(
      statPreview('gear.sampling_corer', 4, PLANET),
    )
  })

  it('answers null for an item of another lane', () => {
    expect(statPreview('power.echo_sounder', 1, PLANET)).toBeNull()
  })
})
