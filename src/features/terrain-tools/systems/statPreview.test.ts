import { describe, expect, it } from 'vitest'
import { statPreview, type TerrainStatPreview } from './statPreview'
import { TERRAIN_ECONOMY } from './terrainEconomy'
import { TERRAIN_ITEMS } from './terrainItems'

const PLANET = 10

/** The TD terrain caps (#162 Endless Mark cap): Marks at P60 and P100 are past every ladder. */
const ENDLESS_MARKS = [20, 34]

function valuesOf(preview: TerrainStatPreview | null): Record<string, number> {
  return Object.fromEntries((preview?.lines ?? []).map((line) => [line.stat, line.value]))
}

function labelsOf(itemId: string): string[] {
  return statPreview(itemId, 1, PLANET)!.lines.map((line) => line.label)
}

/** The Mark that masters the item. */
function masteryMarkOf(itemId: string): number {
  let mark = 1
  while (!statPreview(itemId, mark, PLANET)!.isMastered) mark++
  return mark
}

describe('terrain stat preview', () => {
  it('shows the ore-shifter as bought: 2 charges, 600 cooldown, 6 wind-up, radius 6, 8 cells', () => {
    expect(valuesOf(statPreview('power.ore_shifter', 1, PLANET))).toEqual({
      charges: 2,
      cooldown: 600,
      windup: 6,
      reach: 6,
      size: 8,
    })
    expect(labelsOf('power.ore_shifter')).toEqual([
      'Charges',
      'Cooldown',
      'Wind-up',
      'Radius',
      'Cells dragged',
    ])
  })

  it('shows a consumable as a stack and its size, with no cooldown or wind-up line', () => {
    expect(valuesOf(statPreview('consumable.stabiliser_foam', 1, PLANET))).toEqual({
      charges: 4,
      reach: 4,
      size: 16,
    })
    expect(labelsOf('consumable.stabiliser_foam')).toEqual(['Stack', 'Cone', 'Cells braced'])
  })

  it("prints the lodestone's 256 swaps per beacon beside its gather radius", () => {
    expect(valuesOf(statPreview('consumable.lodestone_beacon', 1, PLANET))).toEqual({
      charges: 1,
      size: 10,
      swaps: 256,
    })
  })

  it('steps cooldown, then size, then charges from Mark 2 (the #165 rotation)', () => {
    const marks = [2, 3, 4].map((mark) => statPreview('power.strata_press', mark, PLANET)!)
    expect(marks.map((preview) => preview.stepped)).toEqual(['cooldown', 'magnitude', 'charges'])
    expect(marks.map(valuesOf)).toEqual([
      { charges: 3, cooldown: 331, windup: 6, size: 6 },
      { charges: 3, cooldown: 331, windup: 6, size: 7 },
      { charges: 4, cooldown: 331, windup: 6, size: 7 },
    ])
  })

  it('steps a consumable size, then stack, since it has no cooldown', () => {
    const marks = [2, 3].map((mark) => statPreview('consumable.seam_splitter', mark, PLANET)!)
    expect(marks.map((preview) => preview.stepped)).toEqual(['magnitude', 'charges'])
  })

  it('stops an ore mover at the income floor and cap: 0.7x cooldown, 1.4x size, +3 charges', () => {
    const last = masteryMarkOf('power.ore_shifter')
    expect(valuesOf(statPreview('power.ore_shifter', last, PLANET))).toEqual({
      charges: 5,
      cooldown: 420,
      windup: 6,
      reach: 6,
      size: 11,
    })
    expect(statPreview('power.ore_shifter', last + 1, PLANET)!.stepped).toBeNull()
  })

  it('stops other items at 0.5x cooldown, 2x size and the TD cap of 32 density cells', () => {
    const press = statPreview('power.strata_press', masteryMarkOf('power.strata_press'), PLANET)
    expect(valuesOf(press)).toEqual({ charges: 6, cooldown: 180, windup: 6, size: 12 })
    const cryo = statPreview('consumable.cryo_binder', masteryMarkOf('consumable.cryo_binder'), 1)
    expect(valuesOf(cryo)).toEqual({ charges: 6, size: 32 })
  })

  it('never grows a size past twice its base or its TD cap, even at the endless Marks of P60 and P100', () => {
    for (const item of TERRAIN_ITEMS) {
      const { magnitude, magnitudeLimit } = TERRAIN_ECONOMY.balance[item.itemId]
      for (const mark of ENDLESS_MARKS) {
        const preview = statPreview(item.itemId, mark, PLANET)!
        expect(valuesOf(preview).size).toBeLessThanOrEqual(
          Math.min(2 * magnitude, magnitudeLimit ?? Infinity),
        )
        expect(preview.isMastered).toBe(true)
      }
    }
  })

  it('reads the same on every planet', () => {
    expect(statPreview('consumable.shoring_props', 4, 40)).toEqual(
      statPreview('consumable.shoring_props', 4, PLANET),
    )
  })

  it('answers null for an item of another lane', () => {
    expect(statPreview('power.mineral_drain', 1, PLANET)).toBeNull()
  })
})
