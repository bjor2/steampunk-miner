/**
 * The archetype palette (ticket 775, spec #774; Planet & Narrative's lock of 23 Oct 2026 under the
 * GD's Campaign Scaling lock): what every solar system past the first is drawn from. Written once,
 * in `palette.json` (P&N: name parts, biome looks, the SS2-B new-content set) and
 * `solar-systems.economy.json` (Systems: size classes; the economy rows' block is
 * `economyRules.ts`'s); read once here and refused whole when broken, so a bad row fails at load
 * with every problem listed.
 *
 * - Name parts: `<Prefix> <Noun> <g>` in the ledger voice, the prefix keyed to the #141 act at the
 *   planet's campaign index `g`, the number `g` itself (so no two planets of the systems past the
 *   first share a name: their `g` differ). Display only, never an id.
 * - Looks: an id, its act, a hue and a ground motif; every pair differs in both hue and motif so
 *   they read at 360 px and 1280+. Each look's art is ticket 778's.
 * - New-content slots: Progression's SS2-B families (one new enemy, hazard or ore family per
 *   planet; ticket 780 completes the set). Each carries its behaviour with the "Never" column it
 *   must keep apart from the first system's content (`familyBehaviours.ts`), its copy templates
 *   (tag, arrival line, hover lines; `familyCopy.ts`) and the one rig part the player sees once the
 *   family is met, on a vehicle attach point. No family ever repeats across the campaign
 *   (`newContentSlots.ts`).
 * - Size classes: S/M/L/XL as basis points of an SS1 planet's radius; XL only on a standard start.
 */
import { familyRows } from '../../planet-mix'
import economyFile from '../solar-systems.economy.json'
import paletteFile from '../palette.json'
import { paletteProblems } from './paletteGuards'

export interface NameParts {
  /** Capitalised prefixes per #141 act id, as "Ember" under `fire`. */
  prefixesByAct: Readonly<Record<string, readonly string[]>>
  /** Capitalised nouns, as "Reach"; any act draws any noun. */
  nouns: readonly string[]
  /** The longest full name, digits reserved, fits the display role inside 360 px. */
  charactersMax: number
  /** Digits of `g` the budget keeps room for. */
  numberDigitsReserved: number
  hookTemplates: HookTemplates
}

export interface HookTemplates {
  /** The ledger hook of a planet whose new slot is something to mind: `{g} {ground} {pays} {mind}`. */
  mindful: string
  /** The hook of a planet whose new slot is an ore family: `{g} {ground} {pays}`. */
  paying: string
}

export interface BiomeLook {
  id: string
  /** The #141 act whose planets wear it. */
  act: string
  hue: string
  groundMotif: string
}

export type NewContentKind = 'enemy' | 'hazard' | 'ore_family'

/** One thing the first system's content does, as "shoot" or "refill"; a family's effect is never one. */
export type BehaviourEffect = string

/** A line of Progression's "Never" column: an effect the family never has, and whose it is. */
export interface NeverBehaviour {
  effect: BehaviourEffect
  /** The first-system id (enemy kind, hazard kind or schedule row) that owns the effect. */
  of: string
}

export interface FamilyBehaviour {
  /** The family's own effect, as "drain_cargo"; no first-system content has it. */
  effect: BehaviourEffect
  /** What the family does, in a sentence or two; design copy, never shown. */
  summary: string
  /** Whether the hazard shows itself before it acts; its telegraph is then the reaction window. */
  telegraphed: boolean
  never: readonly NeverBehaviour[]
}

/** The family's copy as the generator reuses it for any planet that draws the family. */
export interface FamilyCopy {
  /** The planet card's tag, as "Brine leech": one or two words. */
  tag: string
  /** The card's arrival line in the ledger voice; opens with the tag. */
  arrivalLine: string
  /** The hover's lines, each a sentence; `{planet}` and `{g}` are filled per planet. */
  hoverLines: readonly string[]
}

export interface RigPart {
  /** The part's name, as "Scraper skirt". */
  name: string
  /** The vehicle attach point it sits on (`vehicleAttach.ts`), as "hull.plates". */
  attach: string
}

export interface NewContentFamily {
  /** The stable id codex, receipt and saves key on; never reused, never a display name. */
  id: string
  kind: NewContentKind
  name: string
  /** The one rig part the player sees once the family is met. */
  rigPart: RigPart
  behaviour: FamilyBehaviour
  copy: FamilyCopy
}

export interface NewContentSet {
  /** Progression's set name, as "SS2-B". */
  set: string
  /** In campaign order: system 2 draws the first `planetsPerSystem`, system 3 the next. */
  families: readonly NewContentFamily[]
}

export interface SizeClass {
  id: string
  /** The radius as basis points of an SS1 planet's at the same time target. */
  radiusBp: number
  /** Drawn only on a standard-surface planet. */
  standardOnly: boolean
}

export interface SizeClasses {
  /** The time target of the ×1.0 class; a class's target scales with its radius. */
  baseTargetSeconds: number
  classes: readonly SizeClass[]
}

export interface ArchetypePalette {
  names: NameParts
  looks: readonly BiomeLook[]
  newContent: NewContentSet
  sizeClasses: SizeClasses
}

export const ARCHETYPE_PALETTE: ArchetypePalette = loadPalette(paletteFile, economyFile)

/** The acts a system past the first can hold: every #141 act that names families. */
export function mixedActIds(): string[] {
  return [...new Set(familyRows().flatMap((row) => row.homeActs))].sort()
}

function loadPalette(palette: typeof paletteFile, economy: typeof economyFile): ArchetypePalette {
  const problems = paletteProblems(palette, economy, mixedActIds())
  if (problems.length > 0)
    throw new Error(`The solar-systems palette is refused:\n${problems.join('\n')}`)
  return {
    names: palette.names,
    looks: palette.looks,
    newContent: palette.newContentSlots as NewContentSet,
    sizeClasses: economy.sizeClasses,
  }
}
