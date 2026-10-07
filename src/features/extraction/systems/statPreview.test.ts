import { describe, expect, it } from 'vitest'
import { statPreview, type ExtractionStatPreview } from './statPreview'

const PLANET = 9

function valuesOf(preview: ExtractionStatPreview | null): Record<string, number> {
  return Object.fromEntries((preview?.lines ?? []).map((line) => [line.stat, line.value]))
}

/** Every Mark's stepped stat, from Mark 2 up to the one that masters the item. */
function rotationOf(itemId: string): string[] {
  const stepped: string[] = []
  for (let mark = 2; !statPreview(itemId, mark - 1, PLANET)!.isMastered; mark++) {
    stepped.push(statPreview(itemId, mark, PLANET)!.stepped ?? 'none')
  }
  return stepped
}

describe('extraction stat preview', () => {
  it('shows the drain as bought: 2 charges, 900 cooldown, a 60-tick channel, radius 3, 6 cells', () => {
    expect(valuesOf(statPreview('power.mineral_drain', 1, PLANET))).toEqual({
      charges: 2,
      cooldown: 900,
      act: 60,
      reach: 3,
      cells: 6,
    })
  })

  it('names the drain a channel and the siphon a wind-up with a line', () => {
    const labels = (itemId: string) =>
      statPreview(itemId, 1, PLANET)!.lines.map((line) => line.label)
    expect(labels('power.mineral_drain')).toContain('Channel')
    expect(labels('power.slurry_siphon')).toEqual(expect.arrayContaining(['Wind-up', 'Line']))
  })

  it('steps cooldown, then cells, then charges from Mark 2 (the #165 rotation)', () => {
    const marks = [2, 3, 4].map((mark) => statPreview('power.slurry_siphon', mark, PLANET)!)
    expect(marks.map((preview) => preview.stepped)).toEqual(['cooldown', 'magnitude', 'charges'])
    expect(marks.map(valuesOf)).toEqual([
      { charges: 3, cooldown: 552, act: 6, reach: 5, cells: 6 },
      { charges: 3, cooldown: 552, act: 6, reach: 5, cells: 7 },
      { charges: 4, cooldown: 552, act: 6, reach: 5, cells: 7 },
    ])
  })

  it('stops at the income floor and cap: 0.7x cooldown, 1.4x cells, +3 charges, then Mastered', () => {
    for (const [itemId, mastered] of [
      ['power.mineral_drain', { charges: 5, cooldown: 630, act: 60, reach: 3, cells: 8 }],
      ['power.slurry_siphon', { charges: 6, cooldown: 420, act: 6, reach: 5, cells: 8 }],
    ] as const) {
      const last = rotationOf(itemId).length + 1
      expect(statPreview(itemId, last, PLANET)!.isMastered).toBe(true)
      expect(valuesOf(statPreview(itemId, last, PLANET))).toEqual(mastered)
      expect(statPreview(itemId, last + 1, PLANET)!.stepped).toBeNull()
    }
  })

  it('reads the same on every planet: a one-off item never rescales', () => {
    expect(statPreview('power.mineral_drain', 4, 40)).toEqual(
      statPreview('power.mineral_drain', 4, PLANET),
    )
  })

  it('answers null for an item of another lane', () => {
    expect(statPreview('power.echo_sounder', 1, PLANET)).toBeNull()
  })
})
