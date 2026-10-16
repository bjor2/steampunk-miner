/**
 * The look guards of the materials table (ticket 444, #139 GD ruling 5): every species has its own
 * silhouette + pattern + hue slot, and every hue slot keeps out of the reserved heat (15-45) and
 * enemy-purple (268-285) hue bands of the #151 look data and sits above the brightest host rock, so
 * ore reads as ore on every palette.
 */
import { KEBAB_ID } from './materialRowShape'

const HUE_MAX = 360

type Raw = Record<string, unknown>

export type HueBand = readonly [number, number]

export function hueSlotProblems(
  slot: Raw,
  at: number,
  reservedHueBands: readonly HueBand[],
  hostRockLuma: number,
): string[] {
  const where = `hueSlots[${at}]`
  return [
    ...(KEBAB_ID.test(String(slot.id)) ? [] : [`${where}.id must be kebab-case`]),
    ...hueProblems(slot.hue, where, reservedHueBands),
    ...(isUnit(slot.saturation) ? [] : [`${where}.saturation must be in 0..1`]),
    ...lumaProblems(slot.luma, where, hostRockLuma),
  ]
}

/** Two species with the same silhouette, pattern and hue slot would read as one on the ground. */
export function sharedLookProblems(rows: readonly Raw[]): string[] {
  const looks = rows.map(lookKeyOf)
  return rows
    .filter((_, at) => looks.indexOf(looks[at]) !== at)
    .map(
      (row) =>
        `${String(row.id)} shares silhouette ${String(row.silhouette)}, pattern ${String(row.pattern)} and hue slot ${String(row.hueSlot)} with ${String(rows[looks.indexOf(lookKeyOf(row))].id)}`,
    )
}

export function unknownHueSlotProblems(rows: readonly Raw[], slots: readonly Raw[]): string[] {
  const slotIds = slots.map((slot) => slot.id)
  return rows
    .filter((row) => !slotIds.includes(row.hueSlot))
    .map((row) => `${String(row.id)} names the unknown hue slot ${String(row.hueSlot)}`)
}

function hueProblems(hue: unknown, where: string, reserved: readonly HueBand[]): string[] {
  if (typeof hue !== 'number' || hue < 0 || hue >= HUE_MAX) {
    return [`${where}.hue must be degrees in 0..360`]
  }
  return reserved
    .filter(([low, high]) => hue >= low && hue <= high)
    .map(([low, high]) => `${where}.hue ${hue} falls in the reserved ${low}-${high} degrees`)
}

function lumaProblems(luma: unknown, where: string, hostRockLuma: number): string[] {
  if (!isUnit(luma)) return [`${where}.luma must be in 0..1`]
  if ((luma as number) > hostRockLuma) return []
  return [`${where}.luma ${String(luma)} is not above the host rock's ${hostRockLuma.toFixed(3)}`]
}

function lookKeyOf(row: Raw): string {
  return `${String(row.silhouette)}|${String(row.pattern)}|${String(row.hueSlot)}`
}

function isUnit(value: unknown): boolean {
  return typeof value === 'number' && value >= 0 && value <= 1
}
