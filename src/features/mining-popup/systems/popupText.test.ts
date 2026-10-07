import { describe, expect, it } from 'vitest'
import type { OreFace } from './oreFace'
import type { MaterialPlaque, NewMaterial } from './plaqueBoard'
import { chipCountTextOf, plaqueTextOf } from './popupText'

function material(oreId: string, name: string, unitPriceText: string): NewMaterial {
  const face: OreFace = {
    oreId,
    name,
    family: 'crystal',
    gradeName: 'Lustrous',
    iconId: 'none',
    swatch: 'red',
  }
  return { face, unitPriceText }
}

function plaqueOf(materials: readonly NewMaterial[]): MaterialPlaque {
  return { serial: 0, materials, shownTick: 0, endsTick: 201 }
}

describe('popup text', () => {
  it('counts a chip with a times sign', () => {
    expect(chipCountTextOf(12)).toBe('×12')
    expect(chipCountTextOf(12_345)).toBe('×12,345')
  })

  it('names the first material with its family, grade and unit price', () => {
    const text = plaqueTextOf(plaqueOf([material('a', 'Crystal ore, tier 5', '1.25e9')]))
    expect(text).toEqual({
      title: 'NEW MATERIAL',
      name: 'Crystal ore, tier 5',
      detail: 'Crystal · Lustrous',
      price: 'sells for ~1.25e9 each',
      joined: [],
    })
  })

  it('counts joined materials in the title and lists them after the first', () => {
    const joining = material('b', 'Metal ore, tier 5', '9')
    const text = plaqueTextOf(plaqueOf([material('a', 'First', '1'), joining]))
    expect([text.title, text.name, text.joined]).toEqual(['2 NEW MATERIALS', 'First', [joining]])
  })
})
