/**
 * What a chip and the plaque show of an ore (#172 §1, §2): its name, family and grade, its icon
 * and a swatch in the colour its tiles are drawn in on this planet. Until the ores slice (#146)
 * gives each type a #158 hex icon, the kernel ore has none (`iconId: 'none'`) and the swatch
 * stands in for it (Game Director on #178: key on `resourceTier`, tier 0 only).
 */
import { oreTier } from '../../../systems/economy/oreEconomy'
import { oreLookProvider } from '../../../systems/registries/oreLook'
import { oreTypeCatalogue, oreTypeOf, type OreType } from '../../../systems/registries/oreTypes'
import type { Rgb } from '../../../systems/render/colour'
import { ORE_GRADE_NAMES, oreGradeOf } from '../../../systems/render/oreGrade'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { oreCell, RESOURCE_FAMILY } from '../../../systems/world/worldCell'

export interface OreFace {
  oreId: string
  name: string
  family: string
  gradeName: string
  /** A #158 icon id, or `none` while the ore has no icon of its own. */
  iconId: string
  /** CSS colour of the ore's tiles on this planet. */
  swatch: string
}

/** The kernel default's ore id, `kernel.<family>.t<tier>` (systems/registries/oreTypes.ts). */
const KERNEL_ORE_ID = /^kernel\.(metal|crystal)\.t(0|[1-9][0-9]*)$/
const BAND_ONE = 1
const CHANNEL_MAX = 255
const NO_CATALOGUE_GRADE = 0
/** Drawn when no planet is loaded: the brass of the HUD frames. */
const NO_PLANET_SWATCH = 'rgb(201 162 75)'

/** The face of the ore with this id on this planet; null for an id no ore answers to. */
export function oreFaceOf(oreId: string, planet: PlanetParams | null): OreFace | null {
  const ore = oreTypeNamed(oreId)
  if (ore === null) return null
  return {
    oreId,
    name: ore.name,
    family: ore.family,
    gradeName: gradeNameOf(ore),
    iconId: ore.iconId,
    swatch: planet === null ? NO_PLANET_SWATCH : swatchOf(ore, planet),
  }
}

/** The provider's catalogue entry, else the kernel default the id names. */
export function oreTypeNamed(oreId: string): OreType | null {
  return oreTypeCatalogue().find((ore) => ore.id === oreId) ?? kernelOreNamed(oreId)
}

function kernelOreNamed(oreId: string): OreType | null {
  const match = KERNEL_ORE_ID.exec(oreId)
  if (match === null) return null
  const cellFamily = match[1] === 'crystal' ? RESOURCE_FAMILY.crystal : RESOURCE_FAMILY.metal
  return oreTypeOf({ tier: Number.parseInt(match[2], 10), cellFamily })
}

/** #151: the catalogue's grade, else the grade the tier reaches on the `oreGrades` thresholds. */
function gradeNameOf(ore: OreType): string {
  const grade = ore.grade > NO_CATALOGUE_GRADE ? ore.grade : oreGradeOf(ore.tier)
  return ORE_GRADE_NAMES[Math.min(grade, ORE_GRADE_NAMES.length) - 1]
}

/** The look the ground draws an ore cell of this type in, asked of the ore-look seam. */
function swatchOf(ore: OreType, planet: PlanetParams): string {
  const tierOffset = Math.max(0, ore.tier - oreTier(planet.planetIndex, BAND_ONE))
  const look = oreLookProvider().oreLookOfCell(planet, oreCell(ore.cellFamily, tierOffset))
  return cssColourOf(look.colour)
}

function cssColourOf([r, g, b]: Rgb): string {
  return `rgb(${channelOf(r)} ${channelOf(g)} ${channelOf(b)})`
}

function channelOf(share: number): number {
  return Math.round(Math.min(Math.max(share, 0), 1) * CHANNEL_MAX)
}
