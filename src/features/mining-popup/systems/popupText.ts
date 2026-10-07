/**
 * The words on the chips and the plaque (#172 §1, §2): a chip says the ore's name and ×N; the
 * plaque says NEW MATERIAL, the name, family and grade and "sells for ~X each", and lists any
 * discovery that joined it underneath. Every count goes through `formatAmount` (#32).
 */
import { formatAmount } from '../../../systems/displayAmount'
import type { MaterialPlaque, NewMaterial } from './plaqueBoard'

export interface PlaqueText {
  title: string
  name: string
  detail: string
  price: string
  /** The discoveries that joined, after the first. */
  joined: readonly NewMaterial[]
}

export function chipCountTextOf(count: number): string {
  return `×${formatAmount(count)}`
}

export function plaqueTextOf(plaque: MaterialPlaque): PlaqueText {
  const [first, ...joined] = plaque.materials
  return {
    title: plaqueTitleOf(plaque.materials.length),
    name: first.face.name,
    detail: `${capitalised(first.face.family)} · ${first.face.gradeName}`,
    price: `sells for ~${first.unitPriceText} each`,
    joined,
  }
}

function plaqueTitleOf(materialCount: number): string {
  return materialCount === 1 ? 'NEW MATERIAL' : `${formatAmount(materialCount)} NEW MATERIALS`
}

function capitalised(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}
