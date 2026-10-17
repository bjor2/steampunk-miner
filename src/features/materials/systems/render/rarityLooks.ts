/**
 * The rarity look of the ground (ticket 450 under #139; Vertical Scaler's condition 3 on #450):
 * a tint, the width of the frame drawn round each grain, a glow and the share of it that pulses,
 * one row per rarity above common, read once from `rarityLooks.json` and refused whole when
 * broken. Each rarity draws at least what the one below it draws and in a brighter tint, so a
 * higher tier never reads lower than a lower one; the tints keep out of the #151 reserved hue
 * bands, which belong to heat and enemies.
 */
import { isHexColour, lumaOf, rgbOfHex, type Rgb } from '../../../../systems/render/colour'
import { ORE_LOOKS } from '../../../ore-visuals'
import lookFile from '../../rarityLooks.json'
import { MATERIAL_RARITIES, type MaterialRarity } from '../materialRowShape'
import type { HueBand } from '../materialLookRules'

export interface MaterialRarityLook {
  rarity: MaterialRarity
  tint: Rgb
  frame: number
  glow: number
  pulse: number
}

/** The rarities that draw a frame, in order: every one above common. */
export const FRAMED_RARITIES: readonly MaterialRarity[] = MATERIAL_RARITIES.slice(1)

const FRAME_MAX = 0.1
const HUE_TURN = 360
const HUE_SECTOR = 60

type Raw = Record<string, unknown>

export const RARITY_LOOKS: readonly MaterialRarityLook[] = loadRarityLooks(
  lookFile,
  ORE_LOOKS.reservedHueBands,
)

/** Why a file is not the rarity looks; empty when it may ship. */
export function rarityLookProblems(raw: unknown, reservedHueBands: readonly HueBand[]): string[] {
  const rows = ((raw ?? {}) as Raw).rarityLooks
  if (!Array.isArray(rows)) return ['rarityLooks must be a list']
  const shape = (rows as Raw[]).flatMap((row, at) => rowProblems(row, at, reservedHueBands))
  if (shape.length > 0) return shape
  const order = orderProblems(rows as Raw[])
  return order.length > 0 ? order : risingProblems(rows as Raw[])
}

export function loadRarityLooks(
  raw: unknown,
  reservedHueBands: readonly HueBand[],
): MaterialRarityLook[] {
  const problems = rarityLookProblems(raw, reservedHueBands)
  if (problems.length > 0) throw new Error(`rarityLooks.json is refused:\n${problems.join('\n')}`)
  return ((raw as Raw).rarityLooks as Raw[]).map((row) => ({
    rarity: row.rarity as MaterialRarity,
    tint: rgbOfHex(row.tint as string),
    frame: row.frame as number,
    glow: row.glow as number,
    pulse: row.pulse as number,
  }))
}

function rowProblems(row: Raw, at: number, reservedHueBands: readonly HueBand[]): string[] {
  const where = `rarityLooks[${at}]`
  if (!isHexColour(row.tint)) return [`${where}.tint must be #rrggbb`]
  return [
    ...reservedHueProblems(hueOf(rgbOfHex(row.tint)), where, reservedHueBands),
    ...rangeProblems(row.frame, FRAME_MAX, `${where}.frame`),
    ...rangeProblems(row.glow, 1, `${where}.glow`),
    ...rangeProblems(row.pulse, 1, `${where}.pulse`),
  ]
}

function orderProblems(rows: readonly Raw[]): string[] {
  const named = rows.map((row) => row.rarity)
  const isInOrder =
    named.length === FRAMED_RARITIES.length &&
    named.every((rarity, at) => rarity === FRAMED_RARITIES[at])
  return isInOrder ? [] : [`rarityLooks must name ${FRAMED_RARITIES.join(', ')} in that order`]
}

/** Each row's frame wider and tint brighter than the one below, its glow and pulse no less. */
function risingProblems(rows: readonly Raw[]): string[] {
  return rows.slice(1).flatMap((row, at) => {
    const below = rows[at]
    const where = `rarityLooks[${at + 1}] (${String(row.rarity)})`
    return [
      ...((row.frame as number) > (below.frame as number) ? [] : [`${where}.frame must be wider`]),
      ...(tintLumaOf(row) > tintLumaOf(below) ? [] : [`${where}.tint must be brighter`]),
      ...((row.glow as number) >= (below.glow as number) ? [] : [`${where}.glow must not fall`]),
      ...((row.pulse as number) >= (below.pulse as number) ? [] : [`${where}.pulse must not fall`]),
    ]
  })
}

function tintLumaOf(row: Raw): number {
  return lumaOf(rgbOfHex(row.tint as string))
}

function reservedHueProblems(
  hue: number,
  where: string,
  reservedHueBands: readonly HueBand[],
): string[] {
  return reservedHueBands
    .filter(([low, high]) => hue >= low && hue <= high)
    .map(
      ([low, high]) =>
        `${where}.tint's hue ${Math.round(hue)} falls in the reserved ${low}-${high} degrees`,
    )
}

function rangeProblems(value: unknown, high: number, where: string): string[] {
  const isInRange = typeof value === 'number' && value >= 0 && value <= high
  return isInRange ? [] : [`${where} must be a number in 0..${high}`]
}

/** Hue in degrees of a display colour, the HSL hue the hue slots are written in. */
function hueOf([r, g, b]: Rgb): number {
  const high = Math.max(r, g, b)
  const chroma = high - Math.min(r, g, b)
  if (chroma === 0) return 0
  const sector = sectorOf(r, g, b, high, chroma)
  return (sector * HUE_SECTOR + HUE_TURN) % HUE_TURN
}

function sectorOf(r: number, g: number, b: number, high: number, chroma: number): number {
  if (high === r) return (g - b) / chroma
  if (high === g) return (b - r) / chroma + 2
  return (r - g) / chroma + 4
}
