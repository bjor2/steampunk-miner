/**
 * The ore icons (#158 "Endless and ores"): generated from the ore look, never drawn by hand, so
 * every tier of every family has one by construction. A hex frame in the family's hue at the
 * tier's luma (`oreLookOf`), the family's silhouette cut in ink, and the #151 grade as an inset of
 * one to five pips along the bottom edge. The Sell bay's rows hold ore by tier only (#7), so a row
 * takes the `mixed` family: the tier's luma on brass, a nugget silhouette.
 */
import { ART_DIRECTION } from '../../render/artDirection'
import { lumaOf, rgbOfHex, withLuma, type Rgb } from '../../render/colour'
import { oreGradeOf } from '../../render/oreGrade'
import { oreLookOf, type OreFamilyName } from '../../render/oreLook'
import type { IconGlyph } from './iconGlyphs'
import { ICON_COLOURS, ICON_INK, num, svgTextOf, type IconDrawing } from './iconSvg'

export type OreIconFamily = OreFamilyName | 'mixed'

const ORE_ICON_ID = /^icon-ore-(metal|crystal|mixed)-t([1-9][0-9]*)$/

export function oreIconIdOf(family: OreIconFamily, tier: number): string {
  return `icon-ore-${family}-t${tier}`
}

export function isOreIconId(iconId: string): boolean {
  return ORE_ICON_ID.test(iconId)
}

export interface OreIconRequest {
  family: OreIconFamily
  tier: number
}

export function parseOreIconId(iconId: string): OreIconRequest | null {
  const match = ORE_ICON_ID.exec(iconId)
  if (match === null) return null
  return { family: match[1] as OreIconFamily, tier: Number.parseInt(match[2], 10) }
}

const NUGGET: IconGlyph = { body: 'M5 15l3-8 6-3 5 6-2 7-8 1z', lines: 'M8 7l4 5 5-1M12 12l-1 6' }

const FLECKS: IconGlyph = {
  body: 'M3 10l4-5 3 4-3 4zM11 4l5-2 2 5-4 3zM13 13l6 1 1 6-6-1zM4 15l5 1-1 5-5-1z',
}

const SHARDS: IconGlyph = { body: 'M12 1l5 9-5 13-5-13z', lines: 'M12 1v22M7 10h10' }

const GRADE_PIP_RADIUS = 0.9

const GRADE_PIP_Y = 20.2

const GRADE_PIP_GAP = 2.6

/** The SVG text of an ore icon, marked with its family, tier and grade. */
export function oreIconSvgOf(request: OreIconRequest): string {
  const grade = oreGradeOf(request.tier)
  const drawing: IconDrawing = {
    title: `Tier ${request.tier} ${titleOfFamily(request.family)}`,
    frame: 'hex',
    axis: 'neutral',
    bodyColour: hexOfRgb(oreColourOf(request)),
    glyph: glyphOfFamily(request.family),
    extraElements: gradePips(grade),
  }
  return svgTextOf(drawing, {
    family: request.family,
    tier: String(request.tier),
    grade: String(grade),
  })
}

function oreColourOf(request: OreIconRequest): Rgb {
  if (request.family !== 'mixed') return oreLookOf(request.family, request.tier).colour
  const brass = rgbOfHex(ICON_COLOURS.brass)
  return withLuma(brass, lumaOf(oreLookOf('metal', request.tier).colour))
}

function glyphOfFamily(family: OreIconFamily): IconGlyph {
  if (family === 'mixed') return NUGGET
  return ART_DIRECTION.oreFamilies[family].silhouette === 'shards' ? SHARDS : FLECKS
}

function titleOfFamily(family: OreIconFamily): string {
  return family === 'mixed' ? 'ore' : `${family} ore`
}

/** One ink pip per grade along the hex's bottom edge, centred. */
function gradePips(grade: number): string[] {
  const first = 12 - ((grade - 1) * GRADE_PIP_GAP) / 2
  return Array.from({ length: grade }, (_, at) => {
    const x = first + at * GRADE_PIP_GAP
    return `<circle cx="${num(x)}" cy="${num(GRADE_PIP_Y)}" r="${GRADE_PIP_RADIUS}" fill="${ICON_INK}"/>`
  })
}

function hexOfRgb([r, g, b]: Rgb): string {
  return `#${[r, g, b]
    .map((channel) =>
      Math.round(channel * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}
