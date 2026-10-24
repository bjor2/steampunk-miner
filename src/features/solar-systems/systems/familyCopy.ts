/**
 * A planet's copy for its new-content family (ticket 780, spec #774): the family's copy templates
 * (`palette.json`) filled for the planet that drew it, so one hand-written row serves every planet
 * of the campaign that meets the family. Two slots: `{planet}` is the roster name, `{g}` the folio
 * (campaign index). The tag and the arrival line are shaped as the ores slice's hazard card read
 * (ticket 651: the tag, a full stop, one clause), so the kernel's planet card can take them as they
 * are once a seam shows a later system's planet; the hover lines keep the kernel's tooltip budget.
 * Pure and display-only: nothing here reaches an id, a command, a snapshot, a log line or a digest.
 */
import type { NewContentFamily, RigPart } from './paletteRows'
import type { RosterPlanet } from './systemRoster'

/** The slots a copy template may hold, as written in the template. */
export const COPY_SLOTS = { planet: '{planet}', g: '{g}' } as const

export interface CopyFill {
  /** The planet's display name. */
  planet: string
  /** The folio, `g`, as text. */
  g: string
}

/** A planet's family copy, filled: what the card and the hover show once the family is met. */
export interface SlotCopy {
  familyId: string
  tag: string
  arrivalLine: string
  hoverLines: readonly string[]
  rigPart: RigPart
}

/** The planet's family copy filled with its name and folio; null where its slot is empty. */
export function slotCopyOf(planet: RosterPlanet): SlotCopy | null {
  if (planet.slot === null) return null
  return familyCopyFor(planet.slot, { planet: planet.name, g: planet.campaignIndex })
}

/** A family's copy filled for one planet. */
export function familyCopyFor(family: NewContentFamily, fill: CopyFill): SlotCopy {
  return {
    familyId: family.id,
    tag: family.copy.tag,
    arrivalLine: filledCopyOf(family.copy.arrivalLine, fill),
    hoverLines: family.copy.hoverLines.map((line) => filledCopyOf(line, fill)),
    rigPart: family.rigPart,
  }
}

/** Every slot of the template filled; a template with no slot is returned as it is. */
export function filledCopyOf(template: string, fill: CopyFill): string {
  return template.replaceAll(COPY_SLOTS.planet, fill.planet).replaceAll(COPY_SLOTS.g, fill.g)
}
